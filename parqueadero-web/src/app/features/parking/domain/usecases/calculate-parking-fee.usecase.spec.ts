import { CalculateParkingFeeUseCase, CalculateParkingFeeParams } from './calculate-parking-fee.usecase';
import { TariffEntity } from '../entities/tariff.entity';
import { ValidationFailure } from '../../../../core/either/failures';
import { VehicleType } from '../entities/parking-session.entity';

// ── Helpers ───────────────────────────────────────────────────────────────────
// Tarifa canónica para tests (valores del seed real del cliente):
//   moto : per_minute=$60   per_hour=$2.400 plena=$9.000
//   carro: per_minute=$100  per_hour=$3.600 plena=$12.000

const MOTO_DEFAULTS  = { perMinuteCents: 6000,  perHourCents: 240000, plenaCents: 900000  };
const CARRO_DEFAULTS = { perMinuteCents: 10000, perHourCents: 360000, plenaCents: 1200000 };

interface TariffOverrides {
  vehicleType?: VehicleType;
  perMinuteCents?: number | null;
  perHourCents?: number | null;
  plenaCents?: number | null;
}

const makeTariff = (over: TariffOverrides = {}): TariffEntity => {
  const vt = over.vehicleType ?? 'moto';
  const base = vt === 'carro' ? CARRO_DEFAULTS : MOTO_DEFAULTS;
  return new TariffEntity(
    'tariff-id',
    new Date(), new Date(),
    `Tarifa ${vt}`,
    vt,
    'hora',
    over.perHourCents ?? base.perHourCents,    // valueCents legacy (derivado)
    0,                                          // graceMinutes — eliminada del producto (2026-05-24)
    over.plenaCents ?? base.plenaCents,         // dailyCapCents legacy (derivado)
    true,
    undefined, null, null,
    over.perMinuteCents !== undefined ? over.perMinuteCents : base.perMinuteCents,
    over.perHourCents   !== undefined ? over.perHourCents   : base.perHourCents,
    over.plenaCents     !== undefined ? over.plenaCents     : base.plenaCents,
  );
};

const baseParams = (over: Partial<CalculateParkingFeeParams> = {}): CalculateParkingFeeParams => ({
  durationMinutes: 60,
  tariff: makeTariff(),
  isMonthly: false,
  vehicleType: 'moto',
  ...over,
});

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('CalculateParkingFeeUseCase — aditivo (horas × per_hour + minutos × per_minute), tope plena', () => {
  let usecase: CalculateParkingFeeUseCase;

  beforeEach(() => {
    usecase = new CalculateParkingFeeUseCase();
  });

  // ── Validaciones ────────────────────────────────────────────────────────────

  it('ValidationFailure si durationMinutes = 0', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 0 }));
    expect(r.isLeft()).toBeTrue();
    expect(r.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure si durationMinutes negativo', () => {
    expect(usecase.calculate(baseParams({ durationMinutes: -5 })).isLeft()).toBeTrue();
  });

  it('ValidationFailure si la tarifa no trae los 3 fields tiered', () => {
    const r = usecase.calculate(baseParams({
      tariff: makeTariff({ perMinuteCents: null }),
    }));
    expect(r.isLeft()).toBeTrue();
    expect(r.fold(f => f, () => null)).toBeInstanceOf(ValidationFailure);
  });

  it('ValidationFailure si algún field tiered <= 0', () => {
    const r = usecase.calculate(baseParams({
      tariff: makeTariff({ perHourCents: 0 }),
    }));
    expect(r.isLeft()).toBeTrue();
  });

  // ── Mensualidad ─────────────────────────────────────────────────────────────

  it('reason=monthly cuando isMonthly=true, amount=0', () => {
    const r = usecase.calculate(baseParams({ isMonthly: true }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(0);
      expect(fee.reason).toBe('monthly');
      // Breakdown se calcula igual para auditoría.
      expect(fee.breakdown.subtotalCents).toBe(240000);
    });
  });

  // ── Tabla canónica MOTO ($60/min · $2.400/h · $9.000 plena) ─────────────

  it('MOTO 1 min → $60 (0 h + 1 min)', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 1 }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(6000);
      expect(fee.breakdown.hoursCompleted).toBe(0);
      expect(fee.breakdown.remainderMinutes).toBe(1);
      expect(fee.breakdown.cappedByPlena).toBeFalse();
    });
  });

  it('MOTO 15 min → $900', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 15 }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(90000);
    });
  });

  it('MOTO 30 min → $1.800', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 30 }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(180000);
    });
  });

  it('MOTO 59 min → $3.540 (justo antes del corte horario)', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 59 }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(354000);
      expect(fee.breakdown.hoursCompleted).toBe(0);
      expect(fee.breakdown.remainderMinutes).toBe(59);
    });
  });

  it('MOTO 60 min → $2.400 (1 hora exacta)', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 60 }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(240000);
      expect(fee.breakdown.hoursCompleted).toBe(1);
      expect(fee.breakdown.remainderMinutes).toBe(0);
    });
  });

  it('MOTO 90 min → $4.200 (1h × $2.400 + 30 min × $60)', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 90 }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(420000);
      expect(fee.breakdown.hoursCompleted).toBe(1);
      expect(fee.breakdown.remainderMinutes).toBe(30);
      expect(fee.breakdown.hoursSubtotalCents).toBe(240000);
      expect(fee.breakdown.minutesSubtotalCents).toBe(180000);
    });
  });

  it('MOTO 150 min (2h 30min) → $6.600 (ejemplo canónico del usuario)', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 150 }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(660000);
      expect(fee.breakdown.hoursCompleted).toBe(2);
      expect(fee.breakdown.remainderMinutes).toBe(30);
    });
  });

  it('MOTO 180 min (3h) → $7.200', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 180 }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(720000);
    });
  });

  it('MOTO 240 min (4h) → $9.000 (cap por plena: $9.600 > $9.000)', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 240 }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(900000);
      expect(fee.breakdown.cappedByPlena).toBeTrue();
      expect(fee.breakdown.subtotalCents).toBe(960000);
    });
  });

  it('MOTO 720 min (12h) → $9.000 (1 ciclo de plena completo)', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 720 }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(900000);
      expect(fee.breakdown.plenaBlocksCompleted).toBe(1);
      expect(fee.breakdown.remainderAfterPlenaMinutes).toBe(0);
      expect(fee.breakdown.cappedByPlena).toBeTrue();
      expect(fee.breakdown.remainderCappedByPlena).toBeFalse();
    });
  });

  it('MOTO 840 min (14h) → $13.800 (1 plena + 2h × $2.400)', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 840 }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(1380000);
      expect(fee.breakdown.plenaBlocksCompleted).toBe(1);
      expect(fee.breakdown.plenaBlocksSubtotalCents).toBe(900000);
      expect(fee.breakdown.hoursCompleted).toBe(2);
      expect(fee.breakdown.remainderSubtotalCents).toBe(480000);
      expect(fee.breakdown.remainderCappedByPlena).toBeFalse();
    });
  });

  it('MOTO 960 min (16h) → $18.000 (1 plena + fracción de 4h topada a plena)', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 960 }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(1800000);
      expect(fee.breakdown.plenaBlocksCompleted).toBe(1);
      expect(fee.breakdown.remainderSubtotalCents).toBe(960000);
      expect(fee.breakdown.remainderCappedByPlena).toBeTrue();
    });
  });

  it('MOTO 1440 min (24h) → $18.000 (2 ciclos de plena)', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 1440 }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(1800000);
      expect(fee.breakdown.plenaBlocksCompleted).toBe(2);
      expect(fee.breakdown.remainderAfterPlenaMinutes).toBe(0);
      expect(fee.breakdown.cappedByPlena).toBeTrue();
      expect(fee.breakdown.remainderCappedByPlena).toBeFalse();
    });
  });

  // ── Tabla canónica CARRO ($100/min · $3.600/h · $12.000 plena) ──────────

  it('CARRO 1 min → $100', () => {
    const r = usecase.calculate(baseParams({
      durationMinutes: 1,
      tariff: makeTariff({ vehicleType: 'carro' }),
      vehicleType: 'carro',
    }));
    r.fold(f => fail(f.message), fee => expect(fee.amountCents).toBe(10000));
  });

  it('CARRO 30 min → $3.000', () => {
    const r = usecase.calculate(baseParams({
      durationMinutes: 30,
      tariff: makeTariff({ vehicleType: 'carro' }),
      vehicleType: 'carro',
    }));
    r.fold(f => fail(f.message), fee => expect(fee.amountCents).toBe(300000));
  });

  it('CARRO 60 min → $3.600 (1 hora exacta)', () => {
    const r = usecase.calculate(baseParams({
      durationMinutes: 60,
      tariff: makeTariff({ vehicleType: 'carro' }),
      vehicleType: 'carro',
    }));
    r.fold(f => fail(f.message), fee => expect(fee.amountCents).toBe(360000));
  });

  it('CARRO 90 min → $6.600 (1h × $3.600 + 30 min × $100)', () => {
    const r = usecase.calculate(baseParams({
      durationMinutes: 90,
      tariff: makeTariff({ vehicleType: 'carro' }),
      vehicleType: 'carro',
    }));
    r.fold(f => fail(f.message), fee => expect(fee.amountCents).toBe(660000));
  });

  it('CARRO 180 min (3h) → $10.800', () => {
    const r = usecase.calculate(baseParams({
      durationMinutes: 180,
      tariff: makeTariff({ vehicleType: 'carro' }),
      vehicleType: 'carro',
    }));
    r.fold(f => fail(f.message), fee => expect(fee.amountCents).toBe(1080000));
  });

  it('CARRO 200 min (3h 20min) → $12.000 (cap: subtotal=$12.800 > $12.000)', () => {
    const r = usecase.calculate(baseParams({
      durationMinutes: 200,
      tariff: makeTariff({ vehicleType: 'carro' }),
      vehicleType: 'carro',
    }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(1200000);
      expect(fee.breakdown.cappedByPlena).toBeTrue();
    });
  });

  it('CARRO 240 min (4h) → $12.000 (cap)', () => {
    const r = usecase.calculate(baseParams({
      durationMinutes: 240,
      tariff: makeTariff({ vehicleType: 'carro' }),
      vehicleType: 'carro',
    }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(1200000);
      expect(fee.breakdown.plenaBlocksCompleted).toBe(0);
      expect(fee.breakdown.remainderAfterPlenaMinutes).toBe(240);
      expect(fee.breakdown.cappedByPlena).toBeTrue();
    });
  });

  it('CARRO 780 min (13h) → $15.600 (1 plena + 1h)', () => {
    const r = usecase.calculate(baseParams({
      durationMinutes: 780,
      tariff: makeTariff({ vehicleType: 'carro' }),
      vehicleType: 'carro',
    }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(1560000);
      expect(fee.breakdown.plenaBlocksCompleted).toBe(1);
      expect(fee.breakdown.remainderAfterPlenaMinutes).toBe(60);
    });
  });

  it('CARRO 1440 min (24h) cobra 2 plenas', () => {
    const r = usecase.calculate(baseParams({
      durationMinutes: 1440,
      tariff: makeTariff({ vehicleType: 'carro' }),
      vehicleType: 'carro',
    }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.amountCents).toBe(2400000);
      expect(fee.breakdown.plenaBlocksCompleted).toBe(2);
      expect(fee.breakdown.remainderAfterPlenaMinutes).toBe(0);
    });
  });

  // ── Breakdown ────────────────────────────────────────────────────────────

  it('breakdown expone descomposición y duración', () => {
    const r = usecase.calculate(baseParams({ durationMinutes: 90 }));
    r.fold(f => fail(f.message), fee => {
      expect(fee.breakdown.hoursCompleted).toBe(1);
      expect(fee.breakdown.remainderMinutes).toBe(30);
      expect(fee.breakdown.perMinuteCents).toBe(6000);
      expect(fee.breakdown.perHourCents).toBe(240000);
      expect(fee.breakdown.plenaCents).toBe(900000);
      expect(fee.breakdown.hoursSubtotalCents).toBe(240000);
      expect(fee.breakdown.minutesSubtotalCents).toBe(180000);
      expect(fee.breakdown.subtotalCents).toBe(420000);
      expect(fee.breakdown.cappedByPlena).toBeFalse();
      expect(fee.breakdown.durationMinutes).toBe(90);
    });
  });
});
