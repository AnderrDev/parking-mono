import { BaseEntity } from '../../../../core/base/base.entity';
import { VehicleType } from './parking-session.entity';

export class VehicleEntity extends BaseEntity {
  constructor(
    id: string,
    createdAt: Date,
    updatedAt: Date,
    public readonly plate: string,
    public readonly vehicleType: VehicleType,
    public readonly color: string | null,
    public readonly brand: string | null,
    public readonly ownerCustomerId: string | null = null,
    public readonly isDeleted = false,
  ) {
    super(id, createdAt, updatedAt);
  }
}
