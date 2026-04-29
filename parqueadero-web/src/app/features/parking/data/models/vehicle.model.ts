import { VehicleEntity } from '../../domain/entities/vehicle.entity';
import { VehicleType } from '../../domain/entities/parking-session.entity';

export interface VehicleModel {
  id: string;
  plate: string;
  vehicle_type: string;
  color: string | null;
  brand: string | null;
  created_at: string;
  updated_at: string;
}

export class VehicleMapper {
  static toEntity(m: VehicleModel): VehicleEntity {
    return new VehicleEntity(
      m.id,
      new Date(m.created_at),
      new Date(m.updated_at),
      m.plate,
      m.vehicle_type as VehicleType,
      m.color,
      m.brand,
    );
  }
}
