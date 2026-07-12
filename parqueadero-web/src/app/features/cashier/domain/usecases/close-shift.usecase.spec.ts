import { CloseShiftUseCase, CloseShiftParams } from './close-shift.usecase';
import {
  CashierRepository,
  CloseShiftParams as RepoCloseParams,
  RegisterWithdrawalParams,
  ListShiftsParams,
  OperatorOption,
} from '../repositories/cashier.repository';
import { PaymentRepository } from '../../../payments/domain/repositories/payment.repository';
import { CashierShiftEntity } from '../entities/cashier-shift.entity';
import { CashWithdrawalEntity } from '../entities/cash-withdrawal.entity';
import { PaymentEntity, PaymentMethod, PaymentStatus } from '../../../parking/domain/entities/payment.entity';
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

let paymentSeq = 0;
const makePayment = (
  method: PaymentMethod,
  amountCents: number,
  status: PaymentStatus = 'completed',
): PaymentEntity =>
  new PaymentEntity(
    `pay-${++paymentSeq}`, new Date(), new Date(),
    'session-1', 'shift-1', method, amountCents, status, new Date(),
    null, null, null,
  );

const emptyPagination = { page: 1, pageSize: 25, total: 0, totalPages: 0 };

// ── Mock repos ────────────────────────────────────────────────────────────────

class MockCashierRepository extends CashierRepository {
  findByIdResult: ReturnType<CashierRepository['findById']> =
    Promise.resolve(right(makeShift() as CashierShiftEntity | null));
  closeResult: ReturnType<CashierRepository['close']> =
    Promise.resolve(right(makeShift({ status: 'closed' })));
  lastCloseParams: RepoCloseParams | null = null;

  async findById(_id: string) { return this.findByIdResult; }
  async close(params: RepoCloseParams) {
    this.lastCloseParams = params;
    return this.closeResult;
  }
  async findOpen() {
    return Promise.resolve(right(null as CashierShiftEntity | null));
  }
  async findOpenByUser(_userId: string) {
    return Promise.resolve(right(null as CashierShiftEntity | null));
  }
  async create(_params: unknown) { return Promise.resolve(right(null as never)); }
  async correctOpeningBalance(_params: unknown) {
    return Promise.resolve(right(null as never as CashierShiftEntity));
  }
  async listShifts(_params: ListShiftsParams) {
    return Promise.resolve(right({ data: [], pagination: emptyPagination }));
  }
  async listOperators() {
    return Promise.resolve(right([] as OperatorOption[]));
  }
  async registerWithdrawal(_params: RegisterWithdrawalParams) {
    return Promise.resolve(right(null as never as CashWithdrawalEntity));
  }
  async listWithdrawalsByShift(_shiftId: string) {
    return Promise.resolve(right([] as CashWithdrawalEntity[]));
  }
}

class MockPaymentRepository extends PaymentRepository {
  listByShiftResult: ReturnType<PaymentRepository['listByShift']> =
    Promise.resolve(right([] as PaymentEntity[]));

  async sumCashByShift(_shiftId: string) { return Promise.resolve(right(0)); }
  async create(_params: unknown) { return Promise.resolve(right(null as never as PaymentEntity)); }
  async list(_params: unknown) {
    return Promise.resolve(right({ data: [] as PaymentEntity[], pagination: emptyPagination, totalCents: 0 }));
  }
  async listByShift(_shiftId: string) { return this.listByShiftResult; }
  async voidPayment(_params: unknown) { return Promise.resolve(right(null as never as PaymentEntity)); }
  async correctMethod(_params: unknown) { return Promise.resolve(right(null as never as PaymentEntity)); }
  async correctAmount(_params: unknown) { return Promise.resolve(right(null as never as PaymentEntity)); }
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
    digitalVerifiedCents: null,
    justification: null,
    ...overrides,
  });

  beforeEach(() => {
    cashierRepo = new MockCashierRepository();
    paymentRepo = new MockPaymentRepository();
    usecase = new CloseShiftUseCase(cashierRepo, paymentRepo);
  });

  it('happy path: cierra turno sin diferencia', async () => {
    const result = await usecase.execute(baseParams({ closingBalanceCents: 100_000 }));
    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      shift => expect(shift.status).toBe('closed'),
    );
  });

  it('happy path: diferencia dentro del umbral sin justificación', async () => {
    const result = await usecase.execute(baseParams({ closingBalanceCents: 600_000 }));
    expect(result.isRight()).toBeTrue();
  });

  it('happy path: diferencia > umbral con justificación válida', async () => {
    const result = await usecase.execute(baseParams({
      closingBalanceCents: 700_000,
      justification: 'Billete encontrado extra',
    }));
    expect(result.isRight()).toBeTrue();
  });

  it('ValidationFailure: diferencia > umbral sin justificación (spec regla 6)', async () => {
    const result = await usecase.execute(baseParams({
      closingBalanceCents: 700_000,
      justification: null,
    }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: justificación en blanco no cuenta', async () => {
    const result = await usecase.execute(baseParams({
      closingBalanceCents: 700_000,
      justification: '   ',
    }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: saldo de cierre negativo', async () => {
    const result = await usecase.execute(baseParams({ closingBalanceCents: -1 }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: digital verificado negativo', async () => {
    const result = await usecase.execute(baseParams({ digitalVerifiedCents: -1 }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('persiste desglose por método: efectivo, digital y snapshot', async () => {
    paymentRepo.listByShiftResult = Promise.resolve(right([
      makePayment('efectivo', 500_000),
      makePayment('efectivo', 300_000),
      makePayment('nequi', 200_000),
      makePayment('transferencia', 400_000),
      makePayment('cortesia', 0),
      makePayment('efectivo', 999_999, 'refunded'), // anulado: no cuenta
    ]));

    const result = await usecase.execute(baseParams({
      closingBalanceCents: 900_000, // opening 100k + 800k efectivo
      digitalVerifiedCents: 600_000,
    }));

    expect(result.isRight()).toBeTrue();
    const params = cashierRepo.lastCloseParams!;
    expect(params.cashCollectedCents).toBe(800_000);
    expect(params.digitalCollectedCents).toBe(600_000);
    expect(params.digitalVerifiedCents).toBe(600_000);
    expect(params.expectedBalanceCents).toBe(900_000);
    expect(params.differenceCents).toBe(0);
    expect(params.totalsByMethod.length).toBe(4);
    expect(params.totalsByMethod.find(t => t.method === 'efectivo')!.count).toBe(2);
  });

  it('digital no verificado se persiste como null (no 0)', async () => {
    const result = await usecase.execute(baseParams({ digitalVerifiedCents: null }));
    expect(result.isRight()).toBeTrue();
    expect(cashierRepo.lastCloseParams!.digitalVerifiedCents).toBeNull();
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

  it('propaga Left de findById', async () => {
    cashierRepo.findByIdResult = Promise.resolve(left(new NetworkFailure()));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });

  it('propaga Left de listByShift', async () => {
    paymentRepo.listByShiftResult = Promise.resolve(left(new ServerFailure('DB error')));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ServerFailure);
  });
});
