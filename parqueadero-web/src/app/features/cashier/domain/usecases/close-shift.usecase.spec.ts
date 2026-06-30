import { CloseShiftUseCase, CloseShiftParams } from './close-shift.usecase';
import { CashierRepository, RegisterWithdrawalParams, ListShiftsParams } from '../repositories/cashier.repository';
import { PaymentRepository } from '../../../payments/domain/repositories/payment.repository';
import { CashierShiftEntity } from '../entities/cashier-shift.entity';
import { CashWithdrawalEntity } from '../entities/cash-withdrawal.entity';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';
import { left, right } from '../../../../core/either/either';
import { NetworkFailure, NotFoundFailure, ServerFailure, ValidationFailure } from '../../../../core/either/failures';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeShift = (overrides: Partial<{
  status: 'open' | 'closed';
  openingBalanceCents: number;
}> = {}): CashierShiftEntity =>
  new CashierShiftEntity(
    'shift-1', new Date(), new Date(),
    'user-1',
    overrides.status ?? 'open',
    overrides.openingBalanceCents ?? 100_000,
    new Date(),
    null, null, null, null, null, false,
  );

const emptyPagination = { page: 1, pageSize: 25, total: 0, totalPages: 0 };

// ── Mock repos ────────────────────────────────────────────────────────────────

class MockCashierRepository extends CashierRepository {
  findByIdResult: ReturnType<CashierRepository['findById']> =
    Promise.resolve(right(makeShift() as CashierShiftEntity | null));
  closeResult: ReturnType<CashierRepository['close']> =
    Promise.resolve(right(makeShift({ status: 'closed' })));

  async findById(_id: string) { return this.findByIdResult; }
  async close(_params: unknown) { return this.closeResult; }
  async findOpen() {
    return Promise.resolve(right(null as CashierShiftEntity | null));
  }
  async findOpenByUser(_userId: string) {
    return Promise.resolve(right(null as CashierShiftEntity | null));
  }
  async create(_params: unknown) { return Promise.resolve(right(null as never)); }
  async listShifts(_params: ListShiftsParams) {
    return Promise.resolve(right({ data: [], pagination: emptyPagination }));
  }
  async registerWithdrawal(_params: RegisterWithdrawalParams) {
    return Promise.resolve(right(null as never as CashWithdrawalEntity));
  }
  async listWithdrawalsByShift(_shiftId: string) {
    return Promise.resolve(right([] as CashWithdrawalEntity[]));
  }
}

class MockPaymentRepository extends PaymentRepository {
  sumCashResult: ReturnType<PaymentRepository['sumCashByShift']> =
    Promise.resolve(right(0));

  async sumCashByShift(_shiftId: string) { return this.sumCashResult; }
  async create(_params: unknown) { return Promise.resolve(right(null as never as PaymentEntity)); }
  async list(_params: unknown) {
    return Promise.resolve(right({ data: [] as PaymentEntity[], pagination: emptyPagination, totalCents: 0 }));
  }
  async listByShift(_shiftId: string) { return Promise.resolve(right([] as PaymentEntity[])); }
  async voidPayment(_params: unknown) { return Promise.resolve(right(null as never as PaymentEntity)); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CloseShiftUseCase', () => {
  let usecase: CloseShiftUseCase;
  let cashierRepo: MockCashierRepository;
  let paymentRepo: MockPaymentRepository;

  const baseParams = (overrides: Partial<CloseShiftParams> = {}): CloseShiftParams => ({
    shiftId: 'shift-1',
    userId: 'user-1',
    closingBalanceCents: 100_000,
    justification: null,
    ...overrides,
  });

  beforeEach(() => {
    cashierRepo = new MockCashierRepository();
    paymentRepo = new MockPaymentRepository();
    usecase = new CloseShiftUseCase(cashierRepo, paymentRepo);
  });

  it('happy path: cierra turno sin diferencia', async () => {
    paymentRepo.sumCashResult = Promise.resolve(right(0));
    const result = await usecase.execute(baseParams({ closingBalanceCents: 100_000 }));
    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      shift => expect(shift.status).toBe('closed'),
    );
  });

  it('happy path: diferencia dentro del umbral sin justificación', async () => {
    paymentRepo.sumCashResult = Promise.resolve(right(0));
    const result = await usecase.execute(baseParams({ closingBalanceCents: 600_000 }));
    expect(result.isRight()).toBeTrue();
  });

  it('happy path: diferencia > umbral con justificación válida', async () => {
    paymentRepo.sumCashResult = Promise.resolve(right(0));
    const result = await usecase.execute(baseParams({
      closingBalanceCents: 700_000,
      justification: 'Billete encontrado extra',
    }));
    expect(result.isRight()).toBeTrue();
  });

  it('ValidationFailure: saldo de cierre negativo', async () => {
    const result = await usecase.execute(baseParams({ closingBalanceCents: -1 }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('NotFoundFailure: turno no encontrado (null)', async () => {
    cashierRepo.findByIdResult = Promise.resolve(right(null as CashierShiftEntity | null));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NotFoundFailure);
  });

  it('NotFoundFailure: turno ya está cerrado', async () => {
    cashierRepo.findByIdResult = Promise.resolve(right(makeShift({ status: 'closed' }) as CashierShiftEntity | null));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NotFoundFailure);
  });

  it('happy path: permite sobrante grande sin justificación', async () => {
    cashierRepo.findByIdResult = Promise.resolve(right(makeShift({ openingBalanceCents: 0 }) as CashierShiftEntity | null));
    paymentRepo.sumCashResult = Promise.resolve(right(0));
    const result = await usecase.execute(baseParams({
      closingBalanceCents: 600_001,
      justification: null,
    }));
    expect(result.isRight()).toBeTrue();
  });

  it('happy path: permite faltante grande sin justificación', async () => {
    cashierRepo.findByIdResult = Promise.resolve(right(makeShift({ openingBalanceCents: 0 }) as CashierShiftEntity | null));
    paymentRepo.sumCashResult = Promise.resolve(right(600_001));
    const result = await usecase.execute(baseParams({
      closingBalanceCents: 0,
      justification: '   ',
    }));
    expect(result.isRight()).toBeTrue();
  });

  it('propaga Left de findById', async () => {
    cashierRepo.findByIdResult = Promise.resolve(left(new NetworkFailure()));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });

  it('propaga Left de sumCashByShift', async () => {
    paymentRepo.sumCashResult = Promise.resolve(left(new ServerFailure('DB error')));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ServerFailure);
  });
});
