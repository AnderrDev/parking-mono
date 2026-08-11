import { BaseEntity } from '../../../../core/base/base.entity';
import { VehicleType } from './parking-session.entity';

export type TariffUnit = 'minuto' | 'hora' | 'fraccion' | 'dia' | 'mensualidad' | 'quincena';

/**
 * Unidades que representan un PLAN prepagado por un periodo fijo, no un
 * cobro por tiempo estacionado. El parqueo por hora nunca debe elegir una
 * de estas tarifas: antes bastaba con excluir `mensualidad`, pero al
 * aparecer `quincena` esa exclusión dejó de ser suficiente y un plan podía
 * colarse como tarifa de rotación.
 */
export const PLAN_TARIFF_UNITS = ['mensualidad', 'quincena'] as const;

export type PlanTariffUnit = (typeof PLAN_TARIFF_UNITS)[number];

export function isPlanTariffUnit(unit: string | null | undefined): boolean {
  return !!unit && (PLAN_TARIFF_UNITS as readonly string[]).includes(unit);
}

/**
 * Lista en el formato que espera el operador `in` de PostgREST, para usar
 * como `.not('unit', 'in', PLAN_UNITS_FILTER)` en los lookups de parqueo.
 */
export const PLAN_UNITS_FILTER = `("${PLAN_TARIFF_UNITS.join('","')}")`;

export class TariffEntity extends BaseEntity {
  constructor(
    id: string,
    createdAt: Date,
    updatedAt: Date,
    public readonly name: string,
    public readonly vehicleType: VehicleType,
    public readonly unit: TariffUnit,
    public readonly valueCents: number,
    public readonly graceMinutes: number,
    public readonly dailyCapCents: number,
    public readonly isActive: boolean,
    public readonly scheduleJson: Record<string, string> = { todos: '00:00-23:59' },
    public readonly validFrom: Date | null = null,
    public readonly validTo: Date | null = null,
    // Tiered pricing (migration 00023). Nullable hasta Sprint S4 (UI). El nuevo
    // calc usecase (S3) los exige para parking; si llega un row sin estos campos
    // y unit != 'mensualidad', devuelve ValidationFailure.
    public readonly perMinuteCents: number | null = null,
    public readonly perHourCents: number | null = null,
    public readonly plenaCents: number | null = null,
  ) {
    super(id, createdAt, updatedAt);
  }
}
