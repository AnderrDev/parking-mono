import { RegisterCashWithdrawalUseCase } from './register-withdrawal.usecase';
import { CashierRepository, RegisterWithdrawalParams, ListShiftsParams } from '../repositories/cashier.repository';
import { CashierShiftEntity } from '../entities/cashier-shift.entity';
import { CashWithdrawalEntity } from '../entities/cash-withdrawal.entity';
import { left, right } from '../../../../core/either/either';
import { NetworkFailure, ServerFailure, ValidationFailure } from '../../../../core/either/failures';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeWithdrawal = (): CashWithdrawalEntity =>
  new CashWithdrawalEntity(
    'wd-1', new Date(), new Date(),
    'shift-1', 'user-1', 50_000, 'Supervisor turno', 'Retiro para fondos menores', new Date(),
  );

const emptyPagination = { page: 1, pageSize: 25, total: 0, totalPages: 0 };

// ── Mock repo ─────────────────────────────────────────────────────────────────

class MockCashierRepository extends CashierRepository {
  withdrawalResult: ReturnType<CashierRepository['registerWithdrawal']> =
    Promise.resolve(right(makeWithdrawal()));
  capturedParams: RegisterWithdrawalParams | null = null;

  async registerWithdrawal(params: RegisterWithdrawalParams) {
    this.capturedParams = params;
    return this.withdrawalResult;
  }

  async findOpen() { return Promise.resolve(right(null as CashierShiftEntity | null)); }
  async findOpenByUser(_userId: string) { return Promise.resolve(right(null as CashierShiftEntity | null)); }
  async findById(_id: string) { return Promise.resolve(right(null as CashierShiftEntity | null)); }
  async create(_params: unknown) { return Promise.resolve(right(null as never)); }
  async close(_params: unknown) { return Promise.resolve(right(null as never)); }
  async listShifts(_params: ListShiftsParams) {
    return Promise.resolve(right({ data: [], pagination: emptyPagination }));
  }
  async listWithdrawalsByShift(_shiftId: string) {
    return Promise.resolve(right([] as CashWithdrawalEntity[]));
  }
  async listOperators() { return Promise.resolve(right([])); }
  async correctOpeningBalance(_params: unknown) {
    return Promise.resolve(right(null as never as CashierShiftEntity));
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RegisterCashWithdrawalUseCase', () => {
  let usecase: RegisterCashWithdrawalUseCase;
  let repo: MockCashierRepository;

  const baseParams = (overrides: Partial<RegisterWithdrawalParams> = {}): RegisterWithdrawalParams => ({
    shiftId: 'shift-1',
    userId: 'user-1',
    amountCents: 50_000,
    recipient: 'Supervisor turno',
    justification: 'Retiro para fondos menores',
    ...overrides,
  });

  beforeEach(() => {
    repo = new MockCashierRepository();
    usecase = new RegisterCashWithdrawalUseCase(repo);
  });

  it('happy path: registra retiro con datos válidos', async () => {
    const result = await usecase.execute(baseParams());
    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      wd => expect(wd.amountCents).toBe(50_000),
    );
  });

  it('ValidationFailure: monto = 0', async () => {
    const result = await usecase.execute(baseParams({ amountCents: 0 }));
    expect(result.isLeft()).toBeTrue();
    const f = result.fold(f => f, () => null) as ValidationFailure;
    expect(f).toBeInstanceOf(ValidationFailure);
    expect(f.field).toBe('amountCents');
  });

  it('ValidationFailure: monto negativo', async () => {
    const result = await usecase.execute(baseParams({ amountCents: -1000 }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: destinatario vacío', async () => {
    const result = await usecase.execute(baseParams({ recipient: '' }));
    expect(result.isLeft()).toBeTrue();
    const f = result.fold(f => f, () => null) as ValidationFailure;
    expect(f).toBeInstanceOf(ValidationFailure);
    expect(f.field).toBe('recipient');
  });

  it('ValidationFailure: destinatario con menos de 3 caracteres', async () => {
    const result = await usecase.execute(baseParams({ recipient: 'AB' }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('pasa con destinatario de exactamente 3 caracteres', async () => {
    const result = await usecase.execute(baseParams({ recipient: 'Ana' }));
    expect(result.isRight()).toBeTrue();
  });

  it('ValidationFailure: justificación con menos de 5 caracteres', async () => {
    const result = await usecase.execute(baseParams({ justification: 'Ok' }));
    expect(result.isLeft()).toBeTrue();
    const f = result.fold(f => f, () => null) as ValidationFailure;
    expect(f).toBeInstanceOf(ValidationFailure);
    expect(f.field).toBe('justification');
  });

  it('recorta espacios en destinatario y justificación antes de enviar al repo', async () => {
    await usecase.execute(baseParams({
      recipient: '  Juan Pérez  ',
      justification: '  Fondos para caja chica  ',
    }));
    expect(repo.capturedParams?.recipient).toBe('Juan Pérez');
    expect(repo.capturedParams?.justification).toBe('Fondos para caja chica');
  });

  it('propaga NetworkFailure del repositorio', async () => {
    repo.withdrawalResult = Promise.resolve(left(new NetworkFailure()));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });

  it('propaga ServerFailure del repositorio', async () => {
    repo.withdrawalResult = Promise.resolve(left(new ServerFailure('Error BD', 500)));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ServerFailure);
  });
});
