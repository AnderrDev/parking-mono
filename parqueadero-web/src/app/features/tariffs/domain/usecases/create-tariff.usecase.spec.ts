import { CreateTariffUseCase } from './create-tariff.usecase';
import { TariffRepository, CreateTariffParams } from '../repositories/tariff.repository';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { left, right } from '../../../../core/either/either';
import { BusinessRuleFailure, NetworkFailure, ValidationFailure } from '../../../../core/either/failures';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeTariff = (): TariffEntity =>
  new TariffEntity(
    't-1', new Date(), new Date(),
    'Tarifa Carro Hora', 'carro', 'hora', 500_000, 10, 30_000_000, true,
  );

const emptyPagination = { page: 1, pageSize: 25, total: 0, totalPages: 0 };

// ── Mock repo ─────────────────────────────────────────────────────────────────

class MockTariffRepository extends TariffRepository {
  existsActiveResult: ReturnType<TariffRepository['existsActive']> =
    Promise.resolve(right(false));
  createResult: ReturnType<TariffRepository['create']> =
    Promise.resolve(right(makeTariff()));
  capturedCreateParams: CreateTariffParams | null = null;

  async existsActive(_name: string, _type: unknown, _excludeId?: string) {
    return this.existsActiveResult;
  }
  async existsActiveSameCategory(_type: unknown, _isMonthly: boolean, _excludeId?: string) {
    return Promise.resolve(right(false));
  }
  async getActiveMonthlyTariff(_type: unknown) { return Promise.resolve(right(null as TariffEntity | null)); }
  async create(params: CreateTariffParams) {
    this.capturedCreateParams = params;
    return this.createResult;
  }
  async list(_params: unknown) {
    return Promise.resolve(right({ data: [] as TariffEntity[], pagination: emptyPagination }));
  }
  async findById(_id: string) { return Promise.resolve(right(null as TariffEntity | null)); }
  async update(_id: string, _params: unknown) { return Promise.resolve(right(makeTariff())); }
  async deactivate(_id: string) { return Promise.resolve(right(undefined)); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CreateTariffUseCase', () => {
  let usecase: CreateTariffUseCase;
  let repo: MockTariffRepository;

  const baseParams = (overrides: Partial<CreateTariffParams> = {}): CreateTariffParams => ({
    name: 'Tarifa Carro Hora',
    vehicleType: 'carro',
    unit: 'hora',
    valueCents: 500_000,
    graceMinutes: 10,
    dailyCapCents: 30_000_000,
    ...overrides,
  });

  beforeEach(() => {
    repo = new MockTariffRepository();
    usecase = new CreateTariffUseCase(repo);
  });

  it('happy path: crea tarifa con datos válidos', async () => {
    const result = await usecase.execute(baseParams());
    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      tariff => expect(tariff.name).toBe('Tarifa Carro Hora'),
    );
  });

  it('ValidationFailure: nombre vacío', async () => {
    const result = await usecase.execute(baseParams({ name: '' }));
    expect(result.isLeft()).toBeTrue();
    const f = result.fold(f => f, () => null) as ValidationFailure;
    expect(f).toBeInstanceOf(ValidationFailure);
    expect(f.field).toBe('name');
  });

  it('ValidationFailure: nombre con menos de 3 caracteres', async () => {
    const result = await usecase.execute(baseParams({ name: 'AB' }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: nombre mayor a 100 caracteres', async () => {
    const result = await usecase.execute(baseParams({ name: 'A'.repeat(101) }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: valueCents = 0', async () => {
    const result = await usecase.execute(baseParams({ valueCents: 0 }));
    expect(result.isLeft()).toBeTrue();
    expect((result.fold(f => f, () => null) as ValidationFailure).field).toBe('valueCents');
  });

  it('ValidationFailure: valueCents negativo', async () => {
    const result = await usecase.execute(baseParams({ valueCents: -100 }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: valueCents decimal (no entero)', async () => {
    const result = await usecase.execute(baseParams({ valueCents: 500.5 }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: graceMinutes negativo', async () => {
    const result = await usecase.execute(baseParams({ graceMinutes: -1 }));
    expect(result.isLeft()).toBeTrue();
    expect((result.fold(f => f, () => null) as ValidationFailure).field).toBe('graceMinutes');
  });

  it('pasa con graceMinutes = 0', async () => {
    const result = await usecase.execute(baseParams({ graceMinutes: 0 }));
    expect(result.isRight()).toBeTrue();
  });

  it('ValidationFailure: dailyCapCents = 0', async () => {
    const result = await usecase.execute(baseParams({ dailyCapCents: 0 }));
    expect(result.isLeft()).toBeTrue();
    expect((result.fold(f => f, () => null) as ValidationFailure).field).toBe('dailyCapCents');
  });

  it('ValidationFailure: dailyCapCents <= valueCents', async () => {
    const result = await usecase.execute(baseParams({ valueCents: 500_000, dailyCapCents: 500_000 }));
    expect(result.isLeft()).toBeTrue();
    expect((result.fold(f => f, () => null) as ValidationFailure).field).toBe('dailyCapCents');
  });

  it('ValidationFailure: validTo anterior a validFrom', async () => {
    const from = new Date('2025-06-01');
    const to = new Date('2025-05-01');
    const result = await usecase.execute(baseParams({ validFrom: from, validTo: to }));
    expect(result.isLeft()).toBeTrue();
    expect((result.fold(f => f, () => null) as ValidationFailure).field).toBe('validTo');
  });

  it('pasa cuando validFrom y validTo son válidas', async () => {
    const from = new Date('2025-06-01');
    const to = new Date('2025-12-31');
    const result = await usecase.execute(baseParams({ validFrom: from, validTo: to }));
    expect(result.isRight()).toBeTrue();
  });

  it('BusinessRuleFailure: ya existe tarifa activa con ese nombre y tipo', async () => {
    repo.existsActiveResult = Promise.resolve(right(true));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(BusinessRuleFailure);
  });

  it('propaga NetworkFailure de existsActive', async () => {
    repo.existsActiveResult = Promise.resolve(left(new NetworkFailure()));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });

  it('recorta espacios del nombre antes de crear', async () => {
    await usecase.execute(baseParams({ name: '  Tarifa Especial  ' }));
    expect(repo.capturedCreateParams?.name).toBe('Tarifa Especial');
  });
});
