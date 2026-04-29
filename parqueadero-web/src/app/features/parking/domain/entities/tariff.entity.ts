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
  ) {
    super(id, createdAt, updatedAt);
  }
}
