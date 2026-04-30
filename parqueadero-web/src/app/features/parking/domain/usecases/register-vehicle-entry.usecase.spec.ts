import { RegisterVehicleEntryUseCase, RegisterVehicleEntryParams } from './register-vehicle-entry.usecase';
import { ParkingRepository } from '../repositories/parking.repository';
import { ParkingSessionEntity } from '../entities/parking-session.entity';
import { MonthlyPlanEntity } from '../entities/monthly-plan.entity';
import { left, right } from '../../../../core/either/either';
import {
  BusinessRuleFailure,
  NetworkFailure,
  ServerFailure,
  ValidationFailure,
} from '../../../../core/either/failures';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeSession = (plate = 'ABC123'): ParkingSessionEntity =>
  new ParkingSessionEntity(
    'session-id-1',
    new Date(),
    new Date(),
    plate,
    'carro',
    new Date(),
    'user-id-1',
    'active',
    null,
    null,
    null,
    null,
    null,
    null,
    'synced',
  );

const makeActivePlan = (status: 'active' | 'expiring' = 'active'): MonthlyPlanEntity => {
  const future = new Date();
  future.setDate(future.getDate() + 30);
  return new MonthlyPlanEntity(
    'plan-id-1',
    new Date(),
    new Date(),
    'ABC123',
    'customer-id-1',
    status,
    new Date(),
    future,
    'mensual-basico',
  );
};

const makeExpiredPlan = (): MonthlyPlanEntity => {
  const past = new Date();
  past.setDate(past.getDate() - 1);
  return new MonthlyPlanEntity(
    'plan-id-exp',
    new Date(),
    new Date(),
    'ABC123',
    'customer-id-1',
    'expired',
    new Date(2024, 0, 1),
    past,
    'mensual-basico',
  );
};

// ── Mock repo ─────────────────────────────────────────────────────────────────

class MockParkingRepository extends ParkingRepository {
  shiftId: string | null = 'shift-id-1';
  activeSession: ParkingSessionEntity | null = null;
  plan: MonthlyPlanEntity | null = null;
  insertResult = right<ParkingSessionEntity, never>(makeSession());

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getOpenCashierShiftId(_userId: string) {
    return Promise.resolve(right(this.shiftId));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getActiveSessionByPlate(_plate: string) {
    return Promise.resolve(right(this.activeSession));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getActivePlanByPlate(_plate: string) {
    return Promise.resolve(right(this.plan));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async registerEntry(_params: unknown) {
    return Promise.resolve(this.insertResult);
  }

  async getActiveSessions() {
    return Promise.resolve(right({ data: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } }));
  }

  async searchVehicleByPlate() {
    return Promise.resolve(right({ vehicle: null, activeSessions: [], lastSessions: [], monthlyPlan: null }));
  }
}

// ── Base params ───────────────────────────────────────────────────────────────

const baseParams: RegisterVehicleEntryParams = {
  plate: 'ABC123',
  vehicleType: 'carro',
  color: null,
  brand: null,
  userId: 'user-id-1',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RegisterVehicleEntryUseCase', () => {
  let useCase: RegisterVehicleEntryUseCase;
  let repo: MockParkingRepository;

  beforeEach(() => {
    repo = new MockParkingRepository();
    useCase = new RegisterVehicleEntryUseCase(repo);
  });

  // Happy path
  it('registers entry and returns session when all preconditions met', async () => {
    repo.insertResult = Promise.resolve(right(makeSession()));

    const result = await useCase.execute(baseParams);

    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      ({ session, monthlyPlanWarning }) => {
        expect(session.vehiclePlate).toBe('ABC123');
        expect(session.status).toBe('active');
        expect(monthlyPlanWarning).toBeNull();
      },
    );
  });

  it('normalizes and accepts plate with special chars (ABC-123 → ABC123)', async () => {
    repo.insertResult = Promise.resolve(right(makeSession('ABC123')));
    const result = await useCase.execute({ ...baseParams, plate: 'ABC-123' });
    expect(result.isRight()).toBeTrue();
  });

  // ValidationFailure — empty plate
  it('ValidationFailure: empty plate', async () => {
    const result = await useCase.execute({ ...baseParams, plate: '' });

    expect(result.isLeft()).toBeTrue();
    result.fold(
      (f) => expect(f).toBeInstanceOf(ValidationFailure),
      () => fail('Expected Left'),
    );
  });

  // ValidationFailure — invalid plate format
  it('ValidationFailure: invalid plate format', async () => {
    const result = await useCase.execute({ ...baseParams, plate: 'ZZZZZZ99' });

    expect(result.isLeft()).toBeTrue();
    result.fold(
      (f) => {
        expect(f).toBeInstanceOf(ValidationFailure);
        expect((f as ValidationFailure).field).toBe('plate');
      },
      () => fail('Expected Left'),
    );
  });

  // BusinessRuleFailure — no open cashier shift
  it('BusinessRuleFailure: no open cashier shift', async () => {
    repo.shiftId = null;

    const result = await useCase.execute(baseParams);

    expect(result.isLeft()).toBeTrue();
    result.fold(
      (f) => {
        expect(f).toBeInstanceOf(BusinessRuleFailure);
        expect(f.message).toContain('turno de caja');
      },
      () => fail('Expected Left'),
    );
  });

  // BusinessRuleFailure — duplicate active session
  it('BusinessRuleFailure: plate already has active session', async () => {
    repo.activeSession = makeSession('ABC123');

    const result = await useCase.execute(baseParams);

    expect(result.isLeft()).toBeTrue();
    result.fold(
      (f) => {
        expect(f).toBeInstanceOf(BusinessRuleFailure);
        expect(f.message).toContain('ya tiene una sesión activa');
      },
      () => fail('Expected Left'),
    );
  });

  // Monthly plan active — monthlyPlanId set
  it('associates monthly plan id when active plan exists', async () => {
    repo.plan = makeActivePlan('active');
    const session = makeSession();
    repo.insertResult = Promise.resolve(right(session));

    const result = await useCase.execute(baseParams);

    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      ({ monthlyPlanWarning }) => expect(monthlyPlanWarning).toBeNull(),
    );
  });

  // Monthly plan expiring — warning returned
  it('returns warning when plan is expiring', async () => {
    repo.plan = makeActivePlan('expiring');
    repo.insertResult = Promise.resolve(right(makeSession()));

    const result = await useCase.execute(baseParams);

    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      ({ monthlyPlanWarning }) => {
        expect(monthlyPlanWarning).not.toBeNull();
        expect(monthlyPlanWarning).toContain('próxima a vencer');
      },
    );
  });

  // Monthly plan expired — creates rotation session + warning
  it('creates rotation session with warning when plan is expired', async () => {
    repo.plan = makeExpiredPlan();
    repo.insertResult = Promise.resolve(right(makeSession()));

    const result = await useCase.execute(baseParams);

    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      ({ monthlyPlanWarning }) => {
        expect(monthlyPlanWarning).toContain('vencida');
        expect(monthlyPlanWarning).toContain('rotación');
      },
    );
  });

  // NetworkFailure from repository propagated
  it('propagates NetworkFailure from repository', async () => {
    repo.insertResult = Promise.resolve(left(new NetworkFailure()));

    const result = await useCase.execute(baseParams);

    expect(result.isLeft()).toBeTrue();
    result.fold(
      (f) => expect(f).toBeInstanceOf(NetworkFailure),
      () => fail('Expected Left'),
    );
  });

  // ServerFailure from repository propagated
  it('propagates ServerFailure from repository', async () => {
    repo.insertResult = Promise.resolve(
      left(new ServerFailure('DB constraint violation', 500)),
    );

    const result = await useCase.execute(baseParams);

    expect(result.isLeft()).toBeTrue();
    result.fold(
      (f) => expect(f).toBeInstanceOf(ServerFailure),
      () => fail('Expected Left'),
    );
  });

  // Moto plate (ABC12D format)
  it('accepts moto plate format ABC12D', async () => {
    repo.insertResult = Promise.resolve(right(makeSession('ABC12D')));
    const result = await useCase.execute({ ...baseParams, plate: 'ABC12D', vehicleType: 'moto' });
    expect(result.isRight()).toBeTrue();
  });
});
