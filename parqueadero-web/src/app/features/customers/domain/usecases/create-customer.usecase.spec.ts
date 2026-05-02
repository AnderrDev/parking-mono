import { CreateCustomerUseCase } from './create-customer.usecase';
import { CustomerRepository, CreateCustomerParams } from '../repositories/customer.repository';
import { CustomerEntity } from '../entities/customer.entity';
import { left, right } from '../../../../core/either/either';
import { BusinessRuleFailure, NetworkFailure, ValidationFailure } from '../../../../core/either/failures';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeCustomer = (): CustomerEntity =>
  new CustomerEntity(
    'cust-1', 'cedula', '12345678', null, 'Juan Pérez',
    'juan@test.com', '3001234567', null, null, null,
    ['R-99-PN'], false, new Date(), new Date(),
  );

const emptyPagination = { page: 1, pageSize: 25, total: 0, totalPages: 0 };

// ── Mock repo ─────────────────────────────────────────────────────────────────

class MockCustomerRepository extends CustomerRepository {
  existsByDocResult: ReturnType<CustomerRepository['existsByDoc']> =
    Promise.resolve(right(false));
  existsByEmailResult: ReturnType<CustomerRepository['existsByEmail']> =
    Promise.resolve(right(false));
  createResult: ReturnType<CustomerRepository['create']> =
    Promise.resolve(right(makeCustomer()));

  async existsByDoc(_docType: unknown, _docNumber: string, _excludeId?: string) {
    return this.existsByDocResult;
  }
  async existsByEmail(_email: string, _excludeId?: string) {
    return this.existsByEmailResult;
  }
  async create(_params: unknown) { return this.createResult; }
  async list(_params: unknown) {
    return Promise.resolve(right({ data: [] as CustomerEntity[], pagination: emptyPagination }));
  }
  async findById(_id: string) { return Promise.resolve(right(makeCustomer())); }
  async update(_params: unknown) { return Promise.resolve(right(makeCustomer())); }
  async deactivate(_id: string) { return Promise.resolve(right(undefined)); }
  async countActiveMonthlyPlans(_customerId: string) { return Promise.resolve(right(0)); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CreateCustomerUseCase', () => {
  let usecase: CreateCustomerUseCase;
  let repo: MockCustomerRepository;

  const baseParams = (overrides: Partial<CreateCustomerParams> = {}): CreateCustomerParams => ({
    docType: 'cedula',
    docNumber: '12345678',
    name: 'Juan Pérez',
    email: 'juan@test.com',
    phone: '3001234567',
    ...overrides,
  });

  beforeEach(() => {
    repo = new MockCustomerRepository();
    usecase = new CreateCustomerUseCase(repo);
  });

  it('happy path: crea cliente con datos válidos', async () => {
    const result = await usecase.execute(baseParams());
    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      c => expect(c.name).toBe('Juan Pérez'),
    );
  });

  it('happy path: crea cliente sin email ni teléfono', async () => {
    const result = await usecase.execute(baseParams({ email: null, phone: null }));
    expect(result.isRight()).toBeTrue();
  });

  it('ValidationFailure: nombre vacío', async () => {
    const result = await usecase.execute(baseParams({ name: '' }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: nombre de 1 carácter', async () => {
    const result = await usecase.execute(baseParams({ name: 'A' }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: nombre mayor a 200 caracteres', async () => {
    const result = await usecase.execute(baseParams({ name: 'A'.repeat(201) }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: número de documento muy corto (< 5 dígitos)', async () => {
    const result = await usecase.execute(baseParams({ docNumber: '1234' }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: docType nit sin dígito verificador', async () => {
    const result = await usecase.execute(baseParams({ docType: 'nit', docNumber: '900123456', dv: null }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('pasa NIT con dígito verificador válido', async () => {
    const result = await usecase.execute(baseParams({ docType: 'nit', docNumber: '900123456', dv: 5 }));
    expect(result.isRight()).toBeTrue();
  });

  it('ValidationFailure: email con formato inválido', async () => {
    const result = await usecase.execute(baseParams({ email: 'no-es-email' }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: teléfono con formato inválido', async () => {
    const result = await usecase.execute(baseParams({ phone: '12345' }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('pasa teléfono con prefijo +57', async () => {
    const result = await usecase.execute(baseParams({ phone: '+573001234567' }));
    expect(result.isRight()).toBeTrue();
  });

  it('ValidationFailure: dirección mayor a 200 caracteres', async () => {
    const result = await usecase.execute(baseParams({ address: 'A'.repeat(201) }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('BusinessRuleFailure: ya existe cliente con ese documento', async () => {
    repo.existsByDocResult = Promise.resolve(right(true));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(BusinessRuleFailure);
  });

  it('BusinessRuleFailure: email ya registrado', async () => {
    repo.existsByEmailResult = Promise.resolve(right(true));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(BusinessRuleFailure);
  });

  it('propaga NetworkFailure de existsByDoc', async () => {
    repo.existsByDocResult = Promise.resolve(left(new NetworkFailure()));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });

  it('propaga NetworkFailure de existsByEmail', async () => {
    repo.existsByEmailResult = Promise.resolve(left(new NetworkFailure()));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });
});
