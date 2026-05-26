import {
  ParkingSessionEntity,
  VehicleType,
  SessionStatus,
  SyncStatus,
} from '../../domain/entities/parking-session.entity';

export interface ParkingSessionModel {
  id: string;
  vehicle_plate: string;
  vehicle_type: string;
  entry_at: string;
  entry_user_id: string;
  status: string;
  monthly_plan_id: string | null;
  tariff_id: string | null;
  exit_at: string | null;
  exit_user_id: string | null;
  amount_due_cents: number | null;
  created_at: string;
  updated_at: string;
  _sync_status: string;
  // Snapshot inmutable de la tarifa al ingreso (migration 00027). NULL en
  // sesiones legacy y mensualidades.
  tariff_snapshot_name: string | null;
  tariff_snapshot_per_minute_cents: number | null;
  tariff_snapshot_per_hour_cents: number | null;
  tariff_snapshot_plena_cents: number | null;
}

export class ParkingSessionMapper {
  static toEntity(m: ParkingSessionModel): ParkingSessionEntity {
    return new ParkingSessionEntity(
      m.id,
      new Date(m.created_at),
      new Date(m.updated_at),
      m.vehicle_plate,
      m.vehicle_type as VehicleType,
      new Date(m.entry_at),
      m.entry_user_id,
      m.status as SessionStatus,
      m.monthly_plan_id,
      m.tariff_id ?? null,
      m.exit_at ? new Date(m.exit_at) : null,
      m.exit_user_id,
      m.amount_due_cents,
      (m._sync_status as SyncStatus) ?? 'synced',
      m.tariff_snapshot_name ?? null,
      m.tariff_snapshot_per_minute_cents ?? null,
      m.tariff_snapshot_per_hour_cents ?? null,
      m.tariff_snapshot_plena_cents ?? null,
    );
  }

  static toModel(e: ParkingSessionEntity): Omit<ParkingSessionModel, 'created_at' | 'updated_at'> {
    return {
      id: e.id,
      vehicle_plate: e.vehiclePlate,
      vehicle_type: e.vehicleType,
      entry_at: e.entryAt.toISOString(),
      entry_user_id: e.entryUserId,
      status: e.status,
      monthly_plan_id: e.monthlyPlanId,
      tariff_id: e.tariffId,
      exit_at: e.exitAt?.toISOString() ?? null,
      exit_user_id: e.exitUserId,
      amount_due_cents: e.amountDueCents,
      _sync_status: e.syncStatus,
      tariff_snapshot_name: e.tariffSnapshotName,
      tariff_snapshot_per_minute_cents: e.tariffSnapshotPerMinuteCents,
      tariff_snapshot_per_hour_cents: e.tariffSnapshotPerHourCents,
      tariff_snapshot_plena_cents: e.tariffSnapshotPlenaCents,
    };
  }
}
