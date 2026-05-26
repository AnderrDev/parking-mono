import { BaseEntity } from '../../../../core/base/base.entity';

export type VehicleType = 'carro' | 'moto' | 'bicicleta' | 'otro';
export type SessionStatus = 'active' | 'completed' | 'cancelled';
export type SyncStatus = 'synced' | 'pending' | 'conflict';

export class ParkingSessionEntity extends BaseEntity {
  constructor(
    id: string,
    createdAt: Date,
    updatedAt: Date,
    public readonly vehiclePlate: string,
    public readonly vehicleType: VehicleType,
    public readonly entryAt: Date,
    public readonly entryUserId: string,
    public readonly status: SessionStatus,
    public readonly monthlyPlanId: string | null,
    public readonly tariffId: string | null,
    public readonly exitAt: Date | null,
    public readonly exitUserId: string | null,
    public readonly amountDueCents: number | null,
    public readonly syncStatus: SyncStatus,
    /** Snapshot inmutable de la tarifa al momento del ingreso. NULL para
     *  sesiones legacy pre-2026-05-25 y para mensualidades. */
    public readonly tariffSnapshotName: string | null = null,
    public readonly tariffSnapshotPerMinuteCents: number | null = null,
    public readonly tariffSnapshotPerHourCents: number | null = null,
    public readonly tariffSnapshotPlenaCents: number | null = null,
  ) {
    super(id, createdAt, updatedAt);
  }

  get durationMinutes(): number {
    const end = this.exitAt ?? new Date();
    return Math.ceil((end.getTime() - this.entryAt.getTime()) / 60_000);
  }

  get isMonthly(): boolean {
    return this.monthlyPlanId !== null;
  }
}
