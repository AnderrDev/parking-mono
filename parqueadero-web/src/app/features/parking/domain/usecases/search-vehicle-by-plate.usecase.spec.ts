import { SearchVehicleByPlateUseCase } from './search-vehicle-by-plate.usecase';
import { ParkingRepository, VehicleSearchResult } from '../repositories/parking.repository';
import { ParkingSessionEntity } from '../entities/parking-session.entity';
import { MonthlyPlanEntity } from '../entities/monthly-plan.entity';
import { EMPTY_VEHICLE_HISTORY_STATS } from '../entities/vehicle-history-stats.entity';
import { left, right } from '../../../../core/either/either';
import { NetworkFailure, ValidationFailure } from '../../../../core/either/failures';

// ── Helpers ───────────────────────────────────────────────────────────────────

const emptyResult: VehicleSearchResult = {
  vehicle: null,
  activeSessions: [],
  lastSessions: [],
  monthlyPlan: null,
};

const emptyPagination = { page: 1, pageSize: 25, total: 0, totalPages: 0 };

// ── Mock repo ─────────────────────────────────────────────────────────────────

class MockParkingRepository extends ParkingRepository {
  async correctSessionVehicleType(_params: unknown) {
    return Promise.resolve(right(null as never as ParkingSessionEntity));
  }
  searchResult: ReturnType<ParkingRepository['searchVehicleByPlate']> =
    Promise.resolve(right(emptyResult));
  lastQueriedPlate = '';

  async searchVehicleByPlate(plate: string) {
    this.lastQueriedPlate = plate;
    return this.searchResult;
  }

  async registerEntry() { return Promise.resolve(right(null as never)); }
  async getActiveSessionByPlate() { return Promise.resolve(right(null as ParkingSessionEntity | null)); }
  async getActiveSessions() { return Promise.resolve(right({ data: [], pagination: emptyPagination })); }
  async searchPlateSuggestions() { return Promise.resolve(right([])); }
  async getOpenCashierShiftId() { return Promise.resolve(right(null as string | null)); }
  async getOpenShiftSummary() { return Promise.resolve(right(null)); }
  async getActivePlanByPlate() { return Promise.resolve(right(null as MonthlyPlanEntity | null)); }
  async registerExit() { return Promise.resolve(right(null as never)); }
  async getActiveTariff() { return Promise.resolve(right(null as never)); }
  async listSessions() { return Promise.resolve(right({ data: [], pagination: emptyPagination })); }
  async cancelSession() { return Promise.resolve(right(null as never)); }
  async getVehicleHistoryStats() { return Promise.resolve(right(EMPTY_VEHICLE_HISTORY_STATS)); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SearchVehicleByPlateUseCase', () => {
  let usecase: SearchVehicleByPlateUseCase;
  let repo: MockParkingRepository;

  beforeEach(() => {
    repo = new MockParkingRepository();
    usecase = new SearchVehicleByPlateUseCase(repo);
  });

  it('happy path: devuelve resultado para búsqueda con ≥2 caracteres', async () => {
    const result = await usecase.execute({ plate: 'AB' });
    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      r => expect(r.vehicle).toBeNull(),
    );
  });

  it('happy path: búsqueda con placa completa retorna resultado', async () => {
    const result = await usecase.execute({ plate: 'ABC123' });
    expect(result.isRight()).toBeTrue();
  });

  it('ValidationFailure: placa vacía', async () => {
    const result = await usecase.execute({ plate: '' });
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: placa con solo 1 carácter', async () => {
    const result = await usecase.execute({ plate: 'A' });
    expect(result.isLeft()).toBeTrue();
    const failure = result.fold(f => f, () => null) as ValidationFailure;
    expect(failure).toBeInstanceOf(ValidationFailure);
    expect(failure.field).toBe('plate');
  });

  it('normaliza la placa a mayúsculas antes de enviar al repo', async () => {
    await usecase.execute({ plate: 'abc123' });
    expect(repo.lastQueriedPlate).toBe('ABC123');
  });

  it('elimina espacios y guiones antes de enviar al repo', async () => {
    await usecase.execute({ plate: 'ABC-123' });
    expect(repo.lastQueriedPlate).toBe('ABC123');
  });

  it('propaga NetworkFailure del repositorio', async () => {
    repo.searchResult = Promise.resolve(left(new NetworkFailure()));
    const result = await usecase.execute({ plate: 'ABC' });
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });
});
