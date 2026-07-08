import { CheckMonthlyPlanUseCase } from './check-monthly-plan.usecase';
import { ParkingRepository } from '../repositories/parking.repository';
import { MonthlyPlanEntity } from '../entities/monthly-plan.entity';
import { ParkingSessionEntity } from '../entities/parking-session.entity';
import { EMPTY_VEHICLE_HISTORY_STATS } from '../entities/vehicle-history-stats.entity';
import { left, right } from '../../../../core/either/either';
import { NetworkFailure } from '../../../../core/either/failures';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makePlan = (
  status: MonthlyPlanEntity['status'],
  daysFromNow: number,
): MonthlyPlanEntity => {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + daysFromNow);
  return new MonthlyPlanEntity(
    'plan-id-1',
    new Date(),
    new Date(),
    'ABC123',
    'customer-id-1',
    status,
    new Date(),
    endDate,
    'mensual-basico',
  );
};

// ── Mock repo ─────────────────────────────────────────────────────────────────

class MockParkingRepository extends ParkingRepository {
  async correctSessionVehicleType(_params: unknown) {
    return Promise.resolve(right(null as never as ParkingSessionEntity));
  }
  planResult: ReturnType<ParkingRepository['getActivePlanByPlate']> =
    Promise.resolve(right(null));
  lastQueriedPlate = '';

  async getActivePlanByPlate(plate: string) {
    this.lastQueriedPlate = plate;
    return this.planResult;
  }

  async registerEntry() { return Promise.resolve(right(null as never)); }
  async getActiveSessionByPlate() { return Promise.resolve(right(null as ParkingSessionEntity | null)); }
  async getActiveSessions() {
    return Promise.resolve(right({ data: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } }));
  }
  async searchVehicleByPlate() {
    return Promise.resolve(right({ vehicle: null, activeSessions: [], lastSessions: [], monthlyPlan: null }));
  }
  async searchPlateSuggestions() { return Promise.resolve(right([])); }
  async getOpenCashierShiftId() { return Promise.resolve(right(null as string | null)); }
  async getOpenShiftSummary() { return Promise.resolve(right(null)); }
  async registerExit() { return Promise.resolve(right(null as never)); }
  async getActiveTariff() { return Promise.resolve(right(null as never)); }
  async listSessions() {
    return Promise.resolve(right({ data: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } }));
  }
  async cancelSession() { return Promise.resolve(right(null as never)); }
  async getVehicleHistoryStats() { return Promise.resolve(right(EMPTY_VEHICLE_HISTORY_STATS)); }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('CheckMonthlyPlanUseCase', () => {
  let repo: MockParkingRepository;
  let usecase: CheckMonthlyPlanUseCase;

  beforeEach(() => {
    repo = new MockParkingRepository();
    usecase = new CheckMonthlyPlanUseCase(repo);
  });

  it('retorna Right(plan) cuando existe un plan activo', async () => {
    const plan = makePlan('active', 30);
    repo.planResult = Promise.resolve(right(plan));

    const result = await usecase.execute({ plate: 'ABC123' });

    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      p => {
        expect(p).toBe(plan);
        expect(p?.isCurrentlyActive).toBeTrue();
      },
    );
  });

  it('retorna Right(plan) con plan próximo a vencer (status=expiring, ≤3 días)', async () => {
    const plan = makePlan('expiring', 2);
    repo.planResult = Promise.resolve(right(plan));

    const result = await usecase.execute({ plate: 'ABC123' });

    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      p => {
        expect(p?.status).toBe('expiring');
        expect(p!.daysUntilExpiry).toBeLessThanOrEqual(3);
      },
    );
  });

  it('retorna Right(null) cuando no hay plan activo', async () => {
    repo.planResult = Promise.resolve(right(null));

    const result = await usecase.execute({ plate: 'XYZ999' });

    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      p => expect(p).toBeNull(),
    );
  });

  it('retorna Left(NetworkFailure) cuando el repo falla por red', async () => {
    repo.planResult = Promise.resolve(left(new NetworkFailure()));

    const result = await usecase.execute({ plate: 'ABC123' });

    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });

  it('normaliza la placa a mayúsculas y sin espacios antes de consultar el repo', async () => {
    repo.planResult = Promise.resolve(right(null));

    await usecase.execute({ plate: '  abc123  ' });

    expect(repo.lastQueriedPlate).toBe('ABC123');
  });
});
