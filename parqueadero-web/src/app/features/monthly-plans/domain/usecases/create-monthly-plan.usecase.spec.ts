import { CreateMonthlyPlanUseCase } from './create-monthly-plan.usecase';
import { MonthlyPlanRepository, CreateMonthlyPlanParams } from '../repositories/monthly-plan.repository';
import { CustomerRepository } from '../../../customers/domain/repositories/customer.repository';
import { CashierRepository } from '../../../cashier/domain/repositories/cashier.repository';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { CustomerEntity } from '../../../customers/domain/entities/customer.entity';
import { CashierShiftEntity } from '../../../cashier/domain/entities/cashier-shift.entity';
import { left, right } from '../../../../core/either/either';
import { BusinessRuleFailure, NetworkFailure, ValidationFailure } from '../../../../core/either/failures';

// ── Helpers ───────────────────────────────────────────────────────────────────

const future = (daysFromNow: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(0, 0, 0, 0);
  return d;
};

const makeCustomer = (isDeleted = false): CustomerEntity =>
  new CustomerEntity(
    'cust-1', 'cedula', '12345678', null, 'Juan Pérez',
    null, null, null, null, null, ['R-99-PN'], isDeleted, new Date(), new Date(),
  );

const makePlan = (): MonthlyPlanEntity =>
  new MonthlyPlanEntity(
    'plan-1', new Date(), new Date(),
    'ABC123', 'cust-1', 'active',
    future(0), future(30), 'basico', 150_000,
  );

const emptyPagination = { page: 1, pageSize: 25, total: 0, totalPages: 0 };

// ── Mock repos ────────────────────────────────────────────────────────────────

class MockMonthlyPlanRepository extends MonthlyPlanRepository {
  hasActivePlanResult: ReturnType<MonthlyPlanRepository['hasActivePlanForPlate']> =
    Promise.resolve(right(false));
  createResult: ReturnType<MonthlyPlanRepository['createWithPayment']> =
    Promise.resolve(right(makePlan()));
  capturedCreateParams: CreateMonthlyPlanParams | null = null;
  capturedShiftId: string | null = null;

  capturedOverlapRange: { start: Date; end: Date } | undefined;

  async hasActivePlanForPlate(
    _plate: string,
    range?: { start: Date; end: Date },
    _excludeId?: string,
  ) {
    this.capturedOverlapRange = range;
    return this.hasActivePlanResult;
  }
  async createWithPayment(params: CreateMonthlyPlanParams, shiftId: string) {
    this.capturedCreateParams = params;
    this.capturedShiftId = shiftId;
    return this.createResult;
  }
  async list(_params: unknown) {
    return Promise.resolve(right({ data: [] as MonthlyPlanEntity[], pagination: emptyPagination }));
  }
  async findById(_id: string) { return Promise.resolve(right(makePlan())); }
  async update(_params: unknown) { return Promise.resolve(right(makePlan())); }
  async cancel(_id: string) {
    return Promise.resolve(right({ paymentRefunded: false, paymentKeptClosedShift: false }));
  }
}

class MockCustomerRepository extends CustomerRepository {
  findByIdResult: ReturnType<CustomerRepository['findById']> =
    Promise.resolve(right(makeCustomer()));

  async findById(_id: string) { return this.findByIdResult; }
  async list(_params: unknown) {
    return Promise.resolve(right({ data: [] as CustomerEntity[], pagination: emptyPagination }));
  }
  async create(_params: unknown) { return Promise.resolve(right(makeCustomer())); }
  async update(_params: unknown) { return Promise.resolve(right(makeCustomer())); }
  async deactivate(_id: string) { return Promise.resolve(right(undefined)); }
  async existsByDoc(_docType: unknown, _docNumber: string) { return Promise.resolve(right(false)); }
  async existsByEmail(_email: string) { return Promise.resolve(right(false)); }
  async countActiveMonthlyPlans(_customerId: string) { return Promise.resolve(right(0)); }
}

const makeShift = (): CashierShiftEntity =>
  new CashierShiftEntity('shift-1', new Date(), new Date(), 'user-1', 'open', 5_000_000, new Date(), null, null, null, null, null, false);

class MockCashierRepository extends CashierRepository {
  findOpenResult: ReturnType<CashierRepository['findOpen']> =
    Promise.resolve(right(makeShift() as CashierShiftEntity | null));

  async findOpen() { return this.findOpenResult; }
  async findOpenByUser(_userId: string) { return this.findOpenResult; }
  async findById(_id: string) { return Promise.resolve(right(makeShift() as CashierShiftEntity | null)); }
  async create(_params: unknown) { return Promise.resolve(right(makeShift())); }
  async close(_params: unknown) { return Promise.resolve(right(makeShift())); }
  async listShifts(_params: unknown) { return Promise.resolve(right({ data: [], pagination: emptyPagination })); }
  async registerWithdrawal(_params: unknown) { return Promise.resolve(right(null as never)); }
  async listWithdrawalsByShift(_id: string) { return Promise.resolve(right([])); }
  async listOperators() { return Promise.resolve(right([])); }
  async correctOpeningBalance(_params: unknown) {
    return Promise.resolve(right(null as never as CashierShiftEntity));
  }
}

// Ya no hay mock de PaymentRepository: el ingreso lo registra la RPC
// `create_monthly_plan_with_payment` dentro de la misma transacción que el
// plan, así que el use case no orquesta el pago por separado.

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CreateMonthlyPlanUseCase', () => {
  let usecase: CreateMonthlyPlanUseCase;
  let planRepo: MockMonthlyPlanRepository;
  let customerRepo: MockCustomerRepository;
  let cashierRepo: MockCashierRepository;

  const baseParams = (overrides: Partial<CreateMonthlyPlanParams> = {}): CreateMonthlyPlanParams => ({
    vehiclePlate: 'ABC123',
    customerId: 'cust-1',
    planType: 'basico',
    startDate: future(1),
    endDate: future(31),
    amountCents: 150_000,
    paymentMethod: 'efectivo',
    userId: 'user-1',
    ...overrides,
  });

  beforeEach(() => {
    planRepo = new MockMonthlyPlanRepository();
    customerRepo = new MockCustomerRepository();
    cashierRepo = new MockCashierRepository();
    usecase = new CreateMonthlyPlanUseCase(planRepo, customerRepo, cashierRepo);
  });

  it('happy path: crea plan mensual con datos válidos', async () => {
    const result = await usecase.execute(baseParams());
    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      plan => expect(plan.vehiclePlate).toBe('ABC123'),
    );
  });

  it('normaliza placa a mayúsculas antes de crear', async () => {
    await usecase.execute(baseParams({ vehiclePlate: 'abc123' }));
    expect(planRepo.capturedCreateParams?.vehiclePlate).toBe('ABC123');
    // El ingreso va contra el turno abierto, resuelto por el use case.
    expect(planRepo.capturedShiftId).toBe('shift-1');
  });

  it('ValidationFailure: placa con formato inválido', async () => {
    const result = await usecase.execute(baseParams({ vehiclePlate: 'ZZZ999999' }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: tipo de plan no reconocido', async () => {
    const result = await usecase.execute(baseParams({ planType: 'gold' }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('pasa con planType premium', async () => {
    const result = await usecase.execute(baseParams({ planType: 'premium' }));
    expect(result.isRight()).toBeTrue();
  });

  it('pasa con planType ilimitado', async () => {
    const result = await usecase.execute(baseParams({ planType: 'ilimitado' }));
    expect(result.isRight()).toBeTrue();
  });

  it('ValidationFailure: amountCents = 0', async () => {
    const result = await usecase.execute(baseParams({ amountCents: 0 }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: amountCents negativo', async () => {
    const result = await usecase.execute(baseParams({ amountCents: -100 }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  // Retrodatar el inicio es un caso real: la mensualidad se cobra días
  // después de que el cliente empezó a usarla.
  it('permite fecha de inicio anterior a hoy si el plan sigue vigente', async () => {
    const past = new Date();
    past.setDate(past.getDate() - 10);
    const result = await usecase.execute(baseParams({ startDate: past, endDate: future(20) }));
    expect(result.isRight()).toBeTrue();
  });

  it('consulta el solapamiento con el rango pedido, no con "hoy"', async () => {
    const start = future(40);
    const end = future(70);
    await usecase.execute(baseParams({ startDate: start, endDate: end }));
    expect(planRepo.capturedOverlapRange?.start.getDate()).toBe(start.getDate());
    expect(planRepo.capturedOverlapRange?.end.getDate()).toBe(end.getDate());
  });

  it('ValidationFailure: plan que ya venció (fecha fin en el pasado)', async () => {
    const start = new Date();
    start.setDate(start.getDate() - 40);
    const end = new Date();
    end.setDate(end.getDate() - 10);
    const result = await usecase.execute(baseParams({ startDate: start, endDate: end }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: fecha fin igual a fecha inicio', async () => {
    const d = future(5);
    const d2 = new Date(d.getTime());
    const result = await usecase.execute(baseParams({ startDate: d, endDate: d2 }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: fecha fin anterior a fecha inicio', async () => {
    const result = await usecase.execute(baseParams({ startDate: future(10), endDate: future(5) }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: cliente marcado como eliminado', async () => {
    customerRepo.findByIdResult = Promise.resolve(right(makeCustomer(true)));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('propaga Left de findById (fallo al buscar cliente)', async () => {
    customerRepo.findByIdResult = Promise.resolve(left(new NetworkFailure()));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });

  it('BusinessRuleFailure: ya existe plan activo para esa placa', async () => {
    planRepo.hasActivePlanResult = Promise.resolve(right(true));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(BusinessRuleFailure);
  });

  it('propaga Left de hasActivePlanForPlate', async () => {
    planRepo.hasActivePlanResult = Promise.resolve(left(new NetworkFailure()));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });
});
