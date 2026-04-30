import { TariffEntity, TariffUnit } from '../../domain/entities/tariff.entity';
import { VehicleType } from '../../domain/entities/parking-session.entity';

export interface TariffModel {
  id: string;
  name: string;
  vehicle_type: string;
  unit: string;
  value_cents: number;
  grace_minutes: number;
  daily_cap_cents: number;
  schedule_json: Record<string, string>;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  _deleted: boolean;
  created_at: string;
  updated_at: string;
}

export class TariffMapper {
  static toEntity(m: TariffModel): TariffEntity {
    return new TariffEntity(
      m.id,
      new Date(m.created_at),
      new Date(m.updated_at),
      m.name,
      m.vehicle_type as VehicleType,
      m.unit as TariffUnit,
      m.value_cents,
      m.grace_minutes,
      m.daily_cap_cents,
      m.is_active,
      m.schedule_json ?? { todos: '00:00-23:59' },
      m.valid_from ? new Date(m.valid_from) : null,
      m.valid_to ? new Date(m.valid_to) : null,
    );
  }
}
