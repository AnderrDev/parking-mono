import { CalculateParkingFeeUseCase, CalculateParkingFeeParams } from './calculate-parking-fee.usecase';
import { TariffEntity } from '../entities/tariff.entity';
import { ValidationFailure } from '../../../../core/either/failures';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeTariff = (overrides: Partial<{
  unit: string;
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
    (overrides.unit ?? 'hora') as TariffEntity['unit'],
    overrides.valueCents ?? 500_000,
    overrides.graceMinutes ?? 10,
    overrides.dailyCapCents ?? 30_000_000,
    true,
  );

const baseParams = (overrides: Partial<CalculateParkingFeeParams> = {}): CalculateParkingFeeParams => ({
  durationMinutes: 60,
  tariff: makeTariff(),
  isMonthly: false,
  vehicleType: 'carro',
  ...overrides,
});

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('CalculateParkingFeeUseCase', () => {
  let usecase: CalculateParkingFeeUseCase;

  beforeEach(() => {
    usecase = new CalculateParkingFeeUseCase();
  });

  // ── Validaciones ────────────────────────────────────────────────────────────

  it('retorna ValidationFailure si durationMinutes = 0', () => {
    const result = usecase.calculate(baseParams({ durationMinutes: 0 }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('retorna ValidationFailure si durationMinutes es negativo', () => {
    const result = usecase.calculate(baseParams({ durationMinutes: -5 }));
    expect(result.isLeft()).toBeTrue();
  });

  it('retorna ValidationFailure si tope diario = 0', () => {
    const result = usecase.calculate(baseParams({ tariff: makeTariff({ dailyCapCents: 0 }) }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('retorna ValidationFailure si unidad de tarifa es desconocida', () => {
    const result = usecase.calculate(baseParams({ tariff: makeTariff({ unit: 'semana' }) }));
    expect(result.isLeft()).toBeTrue();
    expect(result.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  // ── Gracia ──────────────────────────────────────────────────────────────────

  it('retorna reason=grace si duración < minutos de gracia', () => {
    const result = usecase.calculate(baseParams({
      durationMinutes: 5,
      tariff: makeTariff({ graceMinutes: 10 }),
    }));
    expect(result.isRight()).toBeTrue();
    result.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(0);
      expect(fee.reason).toBe('grace');
    });
  });

  // ── Mensualidad ─────────────────────────────────────────────────────────────

  it('retorna reason=monthly y monto=0 si isMonthly=true', () => {
    const result = usecase.calculate(baseParams({ durationMinutes: 60, isMonthly: true }));
    expect(result.isRight()).toBeTrue();
    result.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(0);
      expect(fee.reason).toBe('monthly');
    });
  });

  // ── Por hora ─────────────────────────────────────────────────────────────────

  it('cobra 1 hora exacta (unit=hora)', () => {
    const result = usecase.calculate(baseParams({
      durationMinutes: 60,
      tariff: makeTariff({ unit: 'hora', valueCents: 500_000 }),
    }));
    expect(result.isRight()).toBeTrue();
    result.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(500_000);
      expect(fee.reason).toBe('paid');
    });
  });

  it('redondea hacia arriba: 61 minutos = 2 horas (unit=hora)', () => {
    const result = usecase.calculate(baseParams({
      durationMinutes: 61,
      tariff: makeTariff({ unit: 'hora', valueCents: 500_000 }),
    }));
    expect(result.isRight()).toBeTrue();
    result.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(1_000_000);
    });
  });

  // ── Tope diario ──────────────────────────────────────────────────────────────

  it('aplica tope diario cuando el cálculo lo supera', () => {
    const result = usecase.calculate(baseParams({
      durationMinutes: 240,
      tariff: makeTariff({ unit: 'hora', valueCents: 500_000, dailyCapCents: 600_000 }),
    }));
    expect(result.isRight()).toBeTrue();
    result.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(600_000);
    });
  });

  // ── Por fracción ─────────────────────────────────────────────────────────────

  it('cobra 1 fracción por 30 minutos exactos (unit=fraccion)', () => {
    const result = usecase.calculate(baseParams({
      durationMinutes: 30,
      tariff: makeTariff({ unit: 'fraccion', valueCents: 200_000, graceMinutes: 0 }),
    }));
    expect(result.isRight()).toBeTrue();
    result.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(200_000);
    });
  });

  it('cobra 2 fracciones por 31 minutos (unit=fraccion)', () => {
    const result = usecase.calculate(baseParams({
      durationMinutes: 31,
      tariff: makeTariff({ unit: 'fraccion', valueCents: 200_000, graceMinutes: 0 }),
    }));
    expect(result.isRight()).toBeTrue();
    result.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(400_000);
    });
  });

  // ── Por día ──────────────────────────────────────────────────────────────────

  it('cobra 2 días por 25 horas (unit=dia)', () => {
    const result = usecase.calculate(baseParams({
      durationMinutes: 25 * 60,
      tariff: makeTariff({ unit: 'dia', valueCents: 5_000_000, graceMinutes: 0, dailyCapCents: 50_000_000 }),
    }));
    expect(result.isRight()).toBeTrue();
    result.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(10_000_000);
    });
  });

  // ── Breakdown ────────────────────────────────────────────────────────────────

  it('incluye breakdown con campos esperados en cobro normal', () => {
    const result = usecase.calculate(baseParams({
      durationMinutes: 60,
      tariff: makeTariff({ unit: 'hora', valueCents: 500_000, graceMinutes: 10, dailyCapCents: 30_000_000 }),
    }));
    result.fold(f => fail(f.message), fee => {
      expect(fee.breakdown.grace).toBe(10);
      expect(fee.breakdown.cap).toBe(30_000_000);
      expect(fee.breakdown.unit).toBe('hora');
      expect(fee.breakdown.durationMinutes).toBe(60);
    });
  });
});
