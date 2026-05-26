import { BaseEntity } from '../../../../core/base/base.entity';
import { VehicleType } from './parking-session.entity';

export type TariffUnit = 'minuto' | 'hora' | 'fraccion' | 'dia' | 'mensualidad';

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
