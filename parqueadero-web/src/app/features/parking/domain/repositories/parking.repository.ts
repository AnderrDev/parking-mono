import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta as Pagination } from '../../../../shared/models/pagination.model';
import { ParkingSessionEntity, VehicleType } from '../entities/parking-session.entity';
import { VehicleEntity } from '../entities/vehicle.entity';
import { MonthlyPlanEntity } from '../entities/monthly-plan.entity';
import { PaymentEntity, PaymentMethod } from '../entities/payment.entity';
import { TariffEntity } from '../entities/tariff.entity';
import { VehicleHistoryStats } from '../entities/vehicle-history-stats.entity';

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

export interface RegisterExitParams {
  sessionId: string;
  plate: string;
  exitAt: Date;
  amountCents: number;
  paymentMethod: PaymentMethod;
  justification: string | null;
  cashierShiftId: string;
  userId: string;
}

export interface RegisterExitResult {
  session: ParkingSessionEntity;
  payment: PaymentEntity;
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

  abstract searchPlateSuggestions(
    query: string,
    limit?: number,
    onlyActive?: boolean,
  ): Promise<Either<Failure, VehicleEntity[]>>;

  abstract getVehicleHistoryStats(
    plate: string,
    recentLimit?: number,
  ): Promise<Either<Failure, VehicleHistoryStats>>;

  abstract getOpenCashierShiftId(
    userId: string,
  ): Promise<Either<Failure, string | null>>;

  abstract getOpenShiftSummary(
    userId: string,
  ): Promise<Either<Failure, OpenShiftSummary | null>>;

  abstract getActivePlanByPlate(
    plate: string,
  ): Promise<Either<Failure, MonthlyPlanEntity | null>>;

  abstract registerExit(
    params: RegisterExitParams,
  ): Promise<Either<Failure, RegisterExitResult>>;

  abstract getActiveTariff(
    vehicleType: VehicleType,
  ): Promise<Either<Failure, TariffEntity>>;

  abstract listSessions(
    params: ListSessionsParams,
  ): Promise<Either<Failure, ListSessionsResult>>;

  abstract cancelSession(
    params: CancelSessionParams,
  ): Promise<Either<Failure, ParkingSessionEntity>>;
}

export interface ListSessionsParams {
  dateFrom?: Date | null;
  dateTo?: Date | null;
  vehicleType?: VehicleType | null;
  plate?: string | null;
  status?: 'all' | 'active' | 'completed' | 'cancelled';
  page: number;
  pageSize: number;
}

export interface ListSessionsResult {
  data: ParkingSessionEntity[];
  pagination: Pagination;
}

export interface CancelSessionParams {
  sessionId: string;
  reason: string;
  userId: string;
}

export interface OpenShiftSummary {
  shiftId: string;
  openedAt: Date;
  openingBalanceCents: number;
}
