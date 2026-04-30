import { BaseEntity } from '../../../../core/base/base.entity';
import { VehicleType } from './parking-session.entity';

export type TariffUnit = 'minuto' | 'hora' | 'fraccion' | 'dia';

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
  ) {
    super(id, createdAt, updatedAt);
  }
}
