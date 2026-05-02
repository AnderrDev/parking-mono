import { CancelParkingSessionUseCase } from './cancel-session.usecase';
import { ParkingRepository, CancelSessionParams } from '../repositories/parking.repository';
import { ParkingSessionEntity } from '../entities/parking-session.entity';
import { MonthlyPlanEntity } from '../entities/monthly-plan.entity';
import { left, right } from '../../../../core/either/either';
import { NetworkFailure, ServerFailure, ValidationFailure } from '../../../../core/either/failures';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeSession = (): ParkingSessionEntity =>
  new ParkingSessionEntity(
    'sess-1', new Date(), new Date(), 'ABC123', 'carro',
    new Date(), 'user-1', 'cancelled', null, null, null, null, null, 'synced',
  );

const emptyPagination = { page: 1, pageSize: 25, total: 0, totalPages: 0 };

// ── Mock repo ─────────────────────────────────────────────────────────────────

class MockParkingRepository extends ParkingRepository {
  cancelResult: ReturnType<ParkingRepository['cancelSession']> =
    Promise.resolve(right(makeSession()));
  capturedParams: CancelSessionParams | null = null;

  async cancelSession(params: CancelSessionParams) {
    this.capturedParams = params;
    return this.cancelResult;
  }

  async registerEntry() { return Promise.resolve(right(null as never)); }
  async getActiveSessionByPlate() { return Promise.resolve(right(null as ParkingSessionEntity | null)); }
  async getActiveSessions() { return Promise.resolve(right({ data: [], pagination: emptyPagination })); }
  async searchVehicleByPlate() {
    return Promise.resolve(right({ vehicle: null, activeSessions: [], lastSessions: [], monthlyPlan: null }));
  }
  async searchPlateSuggestions() { return Promise.resolve(right([])); }
  async getOpenCashierShiftId() { return Promise.resolve(right(null as string | null)); }
  async getOpenShiftSummary() { return Promise.resolve(right(null)); }
  async getActivePlanByPlate() { return Promise.resolve(right(null as MonthlyPlanEntity | null)); }
  async registerExit() { return Promise.resolve(right(null as never)); }
  async getActiveTariff() { return Promise.resolve(right(null as never)); }
  async listSessions() { return Promise.resolve(right({ data: [], pagination: emptyPagination })); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CancelParkingSessionUseCase', () => {
  let usecase: CancelParkingSessionUseCase;
  let repo: MockParkingRepository;

  beforeEach(() => {
    repo = new MockParkingRepository();
    usecase = new CancelParkingSessionUseCase(repo);
  });

  it('happy path: cancela sesión con motivo válido', async () => {
    const result = await usecase.execute({
      sessionId: 'sess-1',
      reason: 'Ingreso accidental del vehículo',
      userId: 'user-1',
    });

    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      s => expect(s.status).toBe('cancelled'),
    );
  });

  it('ValidationFailure: sessionId vacío', async () => {
    const result = await usecase.execute({ sessionId: '', reason: 'Motivo suficiente aqui', userId: 'u1' });
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
    expect((result.fold(f => f, () => null) as ValidationFailure).field).toBe('sessionId');
  });

  it('ValidationFailure: motivo con menos de 10 caracteres', async () => {
    const result = await usecase.execute({ sessionId: 'sess-1', reason: 'Corto', userId: 'u1' });
    expect(result.isLeft()).toBeTrue();
    const failure = result.fold(f => f, () => null) as ValidationFailure;
    expect(failure).toBeInstanceOf(ValidationFailure);
    expect(failure.field).toBe('reason');
  });

  it('ValidationFailure: motivo con exactamente 9 caracteres', async () => {
    const result = await usecase.execute({ sessionId: 'sess-1', reason: '123456789', userId: 'u1' });
    expect(result.isLeft()).toBeTrue();
  });

  it('pasa con motivo de exactamente 10 caracteres', async () => {
    const result = await usecase.execute({ sessionId: 'sess-1', reason: '1234567890', userId: 'u1' });
    expect(result.isRight()).toBeTrue();
  });

  it('recorta espacios en el motivo antes de enviarlo al repo', async () => {
    await usecase.execute({
      sessionId: 'sess-1',
      reason: '  Motivo con espacios  ',
      userId: 'u1',
    });
    expect(repo.capturedParams?.reason).toBe('Motivo con espacios');
  });

  it('propaga NetworkFailure del repositorio', async () => {
    repo.cancelResult = Promise.resolve(left(new NetworkFailure()));
    const result = await usecase.execute({ sessionId: 'sess-1', reason: 'Motivo valido de cancelacion', userId: 'u1' });
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });

  it('propaga ServerFailure del repositorio', async () => {
    repo.cancelResult = Promise.resolve(left(new ServerFailure('Error BD', 500)));
    const result = await usecase.execute({ sessionId: 'sess-1', reason: 'Motivo valido de cancelacion', userId: 'u1' });
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ServerFailure);
  });
});
