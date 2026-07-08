import { OpenShiftUseCase, OpenShiftParams } from './open-shift.usecase';
import { CashierRepository, RegisterWithdrawalParams, ListShiftsParams } from '../repositories/cashier.repository';
import { CashierShiftEntity } from '../entities/cashier-shift.entity';
import { CashWithdrawalEntity } from '../entities/cash-withdrawal.entity';
import { left, right } from '../../../../core/either/either';
import { BusinessRuleFailure, NetworkFailure, ValidationFailure } from '../../../../core/either/failures';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeShift = (status: 'open' | 'closed' = 'open'): CashierShiftEntity =>
  new CashierShiftEntity(
    'shift-1', new Date(), new Date(),
    'user-1', status,
    100_000, new Date(),
    null, null, null, null, null, false,
  );

const emptyPagination = { page: 1, pageSize: 25, total: 0, totalPages: 0 };

// ── Mock repo ─────────────────────────────────────────────────────────────────

class MockCashierRepository extends CashierRepository {
  findOpenResult: ReturnType<CashierRepository['findOpen']> =
    Promise.resolve(right(null as CashierShiftEntity | null));
  createResult: ReturnType<CashierRepository['create']> =
    Promise.resolve(right(makeShift()));

  async findOpen() { return this.findOpenResult; }
  async findOpenByUser(_userId: string) { return this.findOpenResult; }
  async create(_params: unknown) { return this.createResult; }
  async findById(_id: string) { return Promise.resolve(right(null as CashierShiftEntity | null)); }
  async close(_params: unknown) { return Promise.resolve(right(null as never)); }
  async listShifts(_params: ListShiftsParams) {
    return Promise.resolve(right({ data: [], pagination: emptyPagination }));
  }
  async registerWithdrawal(_params: RegisterWithdrawalParams) {
    return Promise.resolve(right(null as never as CashWithdrawalEntity));
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

describe('OpenShiftUseCase', () => {
  let usecase: OpenShiftUseCase;
  let repo: MockCashierRepository;

  const baseParams = (overrides: Partial<OpenShiftParams> = {}): OpenShiftParams => ({
    userId: 'user-1',
    openingBalanceCents: 500_000,
    ...overrides,
  });

  beforeEach(() => {
    repo = new MockCashierRepository();
    usecase = new OpenShiftUseCase(repo);
  });

  it('happy path: abre turno con saldo positivo', async () => {
    const result = await usecase.execute(baseParams());
    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      shift => {
        expect(shift.status).toBe('open');
        expect(shift.userId).toBe('user-1');
      },
    );
  });

  it('happy path: abre turno con saldo inicial de 0', async () => {
    const result = await usecase.execute(baseParams({ openingBalanceCents: 0 }));
    expect(result.isRight()).toBeTrue();
  });

  it('ValidationFailure: saldo negativo', async () => {
    const result = await usecase.execute(baseParams({ openingBalanceCents: -1 }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('BusinessRuleFailure: ya hay una caja abierta', async () => {
    repo.findOpenResult = Promise.resolve(right(makeShift('open') as CashierShiftEntity | null));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    const failure = result.fold(f => f, () => null);
    expect(failure).toBeInstanceOf(BusinessRuleFailure);
    expect(failure!.message).toContain('caja abierta');
  });

  it('propaga Left de findOpenByUser', async () => {
    repo.findOpenResult = Promise.resolve(left(new NetworkFailure()));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });

  it('propaga Left de create', async () => {
    repo.createResult = Promise.resolve(left(new NetworkFailure()));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });
});
