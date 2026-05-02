import { GetActiveSessionsUseCase } from './get-active-sessions.usecase';
import { ParkingRepository } from '../repositories/parking.repository';
import { ParkingSessionEntity } from '../entities/parking-session.entity';
import { MonthlyPlanEntity } from '../entities/monthly-plan.entity';
import { left, right } from '../../../../core/either/either';
import { NetworkFailure, ServerFailure } from '../../../../core/either/failures';
import { NoParams } from '../../../../core/base/usecase';

// ── Mock ──────────────────────────────────────────────────────────────────────

const emptyPagination = { page: 1, pageSize: 100, total: 0, totalPages: 0 };

const makeSession = (): ParkingSessionEntity =>
  new ParkingSessionEntity(
    's1', new Date(), new Date(), 'ABC123', 'carro',
    new Date(), 'user-1', 'active', null, null, null, null, null, 'synced',
  );

class MockParkingRepository extends ParkingRepository {
  sessionsResult: ReturnType<ParkingRepository['getActiveSessions']> =
    Promise.resolve(right({ data: [], pagination: emptyPagination }));
  capturedFilter: unknown = null;
  capturedPagination: unknown = null;
  capturedSort: unknown = null;

  async getActiveSessions(filter: unknown, pagination: unknown, sort: unknown) {
    this.capturedFilter = filter;
    this.capturedPagination = pagination;
    this.capturedSort = sort;
    return this.sessionsResult;
  }

  async registerEntry() { return Promise.resolve(right(null as never)); }
  async getActiveSessionByPlate() { return Promise.resolve(right(null as ParkingSessionEntity | null)); }
  async searchVehicleByPlate() {
    return Promise.resolve(right({ vehicle: null, activeSessions: [], lastSessions: [], monthlyPlan: null }));
  }
  async searchPlateSuggestions() { return Promise.resolve(right([])); }
  async getOpenCashierShiftId() { return Promise.resolve(right(null as string | null)); }
  async getOpenShiftSummary() { return Promise.resolve(right(null)); }
  async getActivePlanByPlate() { return Promise.resolve(right(null as MonthlyPlanEntity | null)); }
  async registerExit() { return Promise.resolve(right(null as never)); }
  async getActiveTariff() { return Promise.resolve(right(null as never)); }
  async listSessions() {
    return Promise.resolve(right({ data: [], pagination: emptyPagination }));
  }
  async cancelSession() { return Promise.resolve(right(null as never)); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GetActiveSessionsUseCase', () => {
  let usecase: GetActiveSessionsUseCase;
  let repo: MockParkingRepository;

  beforeEach(() => {
    repo = new MockParkingRepository();
    usecase = new GetActiveSessionsUseCase(repo);
  });

  it('devuelve Right con lista vacía cuando no hay sesiones activas', async () => {
    const result = await usecase.execute(new NoParams());
    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      ({ data }) => expect(data).toEqual([]),
    );
  });

  it('devuelve Right con sesiones cuando el repo las retorna', async () => {
    const session = makeSession();
    repo.sessionsResult = Promise.resolve(
      right({ data: [session], pagination: { ...emptyPagination, total: 1, totalPages: 1 } }),
    );

    const result = await usecase.execute(new NoParams());

    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      ({ data, pagination }) => {
        expect(data.length).toBe(1);
        expect(data[0]?.vehiclePlate).toBe('ABC123');
        expect(pagination.total).toBe(1);
      },
    );
  });

  it('propaga NetworkFailure del repositorio', async () => {
    repo.sessionsResult = Promise.resolve(left(new NetworkFailure()));
    const result = await usecase.execute(new NoParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });

  it('propaga ServerFailure del repositorio', async () => {
    repo.sessionsResult = Promise.resolve(left(new ServerFailure('DB error', 500)));
    const result = await usecase.execute(new NoParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ServerFailure);
  });

  it('llama al repositorio con pageSize=100 y orden ascendente por entryAt', async () => {
    await usecase.execute(new NoParams());

    const pagination = repo.capturedPagination as { page: number; pageSize: number };
    const sort = repo.capturedSort as { field: string; direction: string };

    expect(pagination.page).toBe(1);
    expect(pagination.pageSize).toBe(100);
    expect(sort.field).toBe('entryAt');
    expect(sort.direction).toBe('asc');
  });
});
