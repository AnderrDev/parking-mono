import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta as Pagination } from '../../../../shared/models/pagination.model';
import { ParkingSessionEntity, VehicleType } from '../entities/parking-session.entity';
import { VehicleEntity } from '../entities/vehicle.entity';
import { MonthlyPlanEntity } from '../entities/monthly-plan.entity';

export interface RegisterEntryParams {
  plate: string;
  vehicleType: VehicleType;
  color: string | null;
  brand: string | null;
  userId: string;
  cashierShiftId: string;
  monthlyPlanId: string | null;
}

export interface ActiveSessionsFilter {
  vehicleType?: VehicleType;
  minDurationMinutes?: number;
}

export interface ActiveSessionsSort {
  field: 'entryAt' | 'plate' | 'duration';
  direction: 'asc' | 'desc';
}

export interface ActiveSessionsResult {
  data: ParkingSessionEntity[];
  pagination: Pagination;
}

export interface VehicleSearchResult {
  vehicle: VehicleEntity | null;
  activeSessions: ParkingSessionEntity[];
  lastSessions: ParkingSessionEntity[];
  monthlyPlan: MonthlyPlanEntity | null;
}

export abstract class ParkingRepository {
  abstract registerEntry(
    params: RegisterEntryParams,
  ): Promise<Either<Failure, ParkingSessionEntity>>;

  abstract getActiveSessionByPlate(
    plate: string,
  ): Promise<Either<Failure, ParkingSessionEntity | null>>;

  abstract getActiveSessions(
    filter: ActiveSessionsFilter,
    pagination: { page: number; pageSize: number },
    sort: ActiveSessionsSort,
  ): Promise<Either<Failure, ActiveSessionsResult>>;

  abstract searchVehicleByPlate(
    plate: string,
  ): Promise<Either<Failure, VehicleSearchResult>>;

  abstract getOpenCashierShiftId(
    userId: string,
  ): Promise<Either<Failure, string | null>>;

  abstract getActivePlanByPlate(
    plate: string,
  ): Promise<Either<Failure, MonthlyPlanEntity | null>>;
}
