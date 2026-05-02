import { RegisterVehicleExitUseCase, RegisterVehicleExitParams } from './register-vehicle-exit.usecase';
import { CalculateParkingFeeUseCase } from './calculate-parking-fee.usecase';
import { ParkingRepository, RegisterExitResult } from '../repositories/parking.repository';
import { ParkingSessionEntity } from '../entities/parking-session.entity';
import { TariffEntity } from '../entities/tariff.entity';
import { PaymentEntity } from '../entities/payment.entity';
import { MonthlyPlanEntity } from '../entities/monthly-plan.entity';
import { left, right } from '../../../../core/either/either';
import {
  BusinessRuleFailure,
  NetworkFailure,
  NotFoundFailure,
  ServerFailure,
  ValidationFailure,
} from '../../../../core/either/failures';

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW = new Date('2025-05-01T12:00:00Z');
const ENTRY = new Date('2025-05-01T10:00:00Z');

const makeSession = (overrides: Partial<{
  monthlyPlanId: string | null;
  vehicleType: 'carro' | 'moto';
}> = {}): ParkingSessionEntity =>
  new ParkingSessionEntity(
    'session-id-1',
    new Date(),
    new Date(),
    'ABC123',
    overrides.vehicleType ?? 'carro',
    ENTRY,
    'user-id-1',
    'active',
    overrides.monthlyPlanId ?? null,
    null,
    null,
    null,
    null,
    'synced',
  );

const makeTariff = (overrides: Partial<{
  unit: TariffEntity['unit'];
  valueCents: number;
  graceMinutes: number;
  dailyCapCents: number;
}> = {}): TariffEntity =>
  new TariffEntity(
    'tariff-id-1',
    new Date(),
    new Date(),
    'Tarifa Carro',
    'carro',
    overrides.unit ?? 'hora',
    overrides.valueCents ?? 500_000,
    overrides.graceMinutes ?? 5,
    overrides.dailyCapCents ?? 30_000_000,
    true,
  );

const makePayment = (): PaymentEntity =>
  new PaymentEntity(
    'pay-id-1',
    new Date(),
    new Date(),
    'session-id-1',
    'shift-id-1',
    'efectivo',
    1_000_000,
    'completed',
    new Date(),
    null,
    null,
    null,
  );

const makeExitResult = (): RegisterExitResult => ({
  session: makeSession(),
  payment: makePayment(),
});

// ── Mock repo ─────────────────────────────────────────────────────────────────

class MockParkingRepository extends ParkingRepository {
  shiftId: string | null = 'shift-id-1';
  session: ParkingSessionEntity | null = makeSession();
  tariff: TariffEntity | null = makeTariff();
  exitResult: ReturnType<ParkingRepository['registerExit']> =
    Promise.resolve(right(makeExitResult()));
  shiftError: typeof left | null = null;
  sessionError: typeof left | null = null;
  tariffError: typeof left | null = null;

  async getOpenCashierShiftId(_userId: string) {
    if (this.shiftError) return Promise.resolve(left(new NetworkFailure()));
    return Promise.resolve(right(this.shiftId));
  }
  async getOpenShiftSummary(_userId: string) {
    return Promise.resolve(right(null));
  }
  async getActiveSessionByPlate(_plate: string) {
    if (this.sessionError) return Promise.resolve(left(new ServerFailure('DB error')));
    return Promise.resolve(right(this.session));
  }
  async getActiveTariff(_type: unknown) {
    if (this.tariffError) return Promise.resolve(left(new NetworkFailure()));
    return Promise.resolve(right(this.tariff as TariffEntity));
  }
  async registerExit(_params: unknown) {
    return this.exitResult;
  }
  async registerEntry() { return Promise.resolve(right(null as never)); }
  async getActiveSessions() {
    return Promise.resolve(right({ data: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } }));
  }
  async searchVehicleByPlate() {
    return Promise.resolve(right({ vehicle: null, activeSessions: [], lastSessions: [], monthlyPlan: null }));
  }
  async searchPlateSuggestions() { return Promise.resolve(right([])); }
  async getActivePlanByPlate() {
    return Promise.resolve(right(null as MonthlyPlanEntity | null));
  }
  async listSessions() {
    return Promise.resolve(right({ data: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } }));
  }
  async cancelSession() { return Promise.resolve(right(null as never)); }
}

// ── Base params ───────────────────────────────────────────────────────────────

const baseParams = (overrides: Partial<RegisterVehicleExitParams> = {}): RegisterVehicleExitParams => ({
  plate: 'ABC123',
  paymentMethod: 'efectivo',
  userId: 'user-id-1',
  exitAt: NOW,
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RegisterVehicleExitUseCase', () => {
  let usecase: RegisterVehicleExitUseCase;
  let repo: MockParkingRepository;
  let feeCalc: CalculateParkingFeeUseCase;

  beforeEach(() => {
    repo = new MockParkingRepository();
    feeCalc = new CalculateParkingFeeUseCase();
    usecase = new RegisterVehicleExitUseCase(repo, feeCalc);
  });

  it('happy path: registra salida y devuelve session + payment', async () => {
    const result = await usecase.execute(baseParams());
    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      ({ session, payment }) => {
        expect(session.vehiclePlate).toBe('ABC123');
        expect(payment.sessionId).toBe('session-id-1');
      },
    );
  });

  it('ValidationFailure: placa vacía', async () => {
    const result = await usecase.execute(baseParams({ plate: '' }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure: placa solo espacios', async () => {
    const result = await usecase.execute(baseParams({ plate: '   ' }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('BusinessRuleFailure: no hay caja abierta', async () => {
    repo.shiftId = null;
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(BusinessRuleFailure);
  });

  it('propaga Left de getOpenCashierShiftId', async () => {
    repo.shiftError = left;
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });

  it('NotFoundFailure: no hay sesión activa para esa placa', async () => {
    repo.session = null;
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NotFoundFailure);
  });

  it('propaga Left de getActiveSessionByPlate', async () => {
    repo.sessionError = left;
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ServerFailure);
  });

  it('ValidationFailure: no hay tarifa activa', async () => {
    repo.tariff = null;
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('propaga Left de getActiveTariff', async () => {
    repo.tariffError = left;
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(NetworkFailure);
  });

  it('método mensual → resultado exitoso cuando sesión es de mensualidad', async () => {
    repo.session = makeSession({ monthlyPlanId: 'plan-id-1' });
    const result = await usecase.execute(baseParams({
      paymentMethod: 'efectivo',
      justificationIfFree: 'Plan mensual activo',
    }));
    expect(result.isRight()).toBeTrue();
  });

  it('ValidationFailure: método cortesía sin justificación', async () => {
    const result = await usecase.execute(baseParams({
      paymentMethod: 'cortesia',
      justificationIfFree: '',
    }));
    expect(result.isLeft()).toBeTrue();
    const failure = result.fold(f => f, () => null);
    expect(failure).toBeInstanceOf(ValidationFailure);
    expect((failure as ValidationFailure).field).toBe('justificationIfFree');
  });

  it('método cortesía con justificación válida pasa', async () => {
    const result = await usecase.execute(baseParams({
      paymentMethod: 'cortesia',
      justificationIfFree: 'Cliente VIP por evento especial',
    }));
    expect(result.isRight()).toBeTrue();
  });

  it('método error con justificación válida pasa', async () => {
    const result = await usecase.execute(baseParams({
      paymentMethod: 'error',
      justificationIfFree: 'Error en sistema de caja',
    }));
    expect(result.isRight()).toBeTrue();
  });

  it('propaga Left de registerExit', async () => {
    repo.exitResult = Promise.resolve(left(new ServerFailure('Fallo al guardar', 500)));
    const result = await usecase.execute(baseParams());
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ServerFailure);
  });

  it('usa Now como exitAt cuando no se proporciona', async () => {
    const result = await usecase.execute({
      plate: 'ABC123',
      paymentMethod: 'efectivo',
      userId: 'user-id-1',
    });
    expect(result.isRight()).toBeTrue();
  });
});
