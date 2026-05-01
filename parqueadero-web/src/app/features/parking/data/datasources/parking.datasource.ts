import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta as Pagination } from '../../../../shared/models/pagination.model';
import { ParkingSessionEntity, VehicleType } from '../../domain/entities/parking-session.entity';
import { VehicleEntity } from '../../domain/entities/vehicle.entity';
import { MonthlyPlanEntity } from '../../domain/entities/monthly-plan.entity';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import {
  RegisterEntryParams,
  RegisterExitParams,
  RegisterExitResult,
  ActiveSessionsFilter,
  ActiveSessionsSort,
  ListSessionsParams,
  ListSessionsResult,
  CancelSessionParams,
} from '../../domain/repositories/parking.repository';

export interface ActiveSessionsPage {
  data: ParkingSessionEntity[];
  pagination: Pagination;
}

export interface VehicleSearchData {
  vehicle: VehicleEntity | null;
  activeSessions: ParkingSessionEntity[];
  lastSessions: ParkingSessionEntity[];
  monthlyPlan: MonthlyPlanEntity | null;
}

export abstract class ParkingDataSource {
  abstract insertSession(
    params: RegisterEntryParams,
  ): Promise<Either<Failure, ParkingSessionEntity>>;

  abstract getActiveSessionByPlate(
    plate: string,
  ): Promise<Either<Failure, ParkingSessionEntity | null>>;

  abstract getActiveSessions(
    filter: ActiveSessionsFilter,
    pagination: { page: number; pageSize: number },
    sort: ActiveSessionsSort,
  ): Promise<Either<Failure, ActiveSessionsPage>>;

  abstract searchVehicle(plate: string): Promise<Either<Failure, VehicleSearchData>>;

  abstract getOpenCashierShiftId(userId: string): Promise<Either<Failure, string | null>>;

  abstract getActivePlanByPlate(plate: string): Promise<Either<Failure, MonthlyPlanEntity | null>>;

  abstract closeSession(params: RegisterExitParams): Promise<Either<Failure, RegisterExitResult>>;

  abstract getActiveTariff(vehicleType: VehicleType): Promise<Either<Failure, TariffEntity>>;

  abstract listSessions(params: ListSessionsParams): Promise<Either<Failure, ListSessionsResult>>;

  abstract cancelSession(params: CancelSessionParams): Promise<Either<Failure, ParkingSessionEntity>>;
}
