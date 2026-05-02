import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PARKING_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { PaginationMeta as Pagination } from '../../../../shared/models/pagination.model';
import { ParkingSessionEntity, VehicleType } from '../../domain/entities/parking-session.entity';
import { VehicleEntity } from '../../domain/entities/vehicle.entity';
import { MonthlyPlanEntity } from '../../domain/entities/monthly-plan.entity';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import {
  ParkingRepository,
  RegisterEntryParams,
  RegisterExitParams,
  RegisterExitResult,
  ActiveSessionsFilter,
  ActiveSessionsSort,
  ActiveSessionsResult,
  VehicleSearchResult,
  ListSessionsParams,
  ListSessionsResult,
  CancelSessionParams,
  OpenShiftSummary,
} from '../../domain/repositories/parking.repository';
import { ParkingDataSource } from '../datasources/parking.datasource';

@Injectable()
export class ParkingRepositoryImpl extends ParkingRepository {
  constructor(
    @Inject(PARKING_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: ParkingDataSource,
  ) {
    super();
  }

  async registerEntry(
    params: RegisterEntryParams,
  ): Promise<Either<Failure, ParkingSessionEntity>> {
    return this.remoteDs.insertSession(params);
  }

  async getActiveSessionByPlate(
    plate: string,
  ): Promise<Either<Failure, ParkingSessionEntity | null>> {
    return this.remoteDs.getActiveSessionByPlate(plate);
  }

  async getActiveSessions(
    filter: ActiveSessionsFilter,
    pagination: { page: number; pageSize: number },
    sort: ActiveSessionsSort,
  ): Promise<Either<Failure, ActiveSessionsResult>> {
    const result = await this.remoteDs.getActiveSessions(filter, pagination, sort);
    return result.map((page) => ({
      data: page.data,
      pagination: page.pagination as Pagination,
    }));
  }

  async searchVehicleByPlate(plate: string): Promise<Either<Failure, VehicleSearchResult>> {
    return this.remoteDs.searchVehicle(plate);
  }

  async searchPlateSuggestions(
    query: string,
    limit = 8,
  ): Promise<Either<Failure, VehicleEntity[]>> {
    return this.remoteDs.searchPlateSuggestions(query, limit);
  }

  async getOpenCashierShiftId(userId: string): Promise<Either<Failure, string | null>> {
    return this.remoteDs.getOpenCashierShiftId(userId);
  }

  async getOpenShiftSummary(
    userId: string,
  ): Promise<Either<Failure, OpenShiftSummary | null>> {
    return this.remoteDs.getOpenShiftSummary(userId);
  }

  async getActivePlanByPlate(plate: string): Promise<Either<Failure, MonthlyPlanEntity | null>> {
    return this.remoteDs.getActivePlanByPlate(plate);
  }

  async registerExit(params: RegisterExitParams): Promise<Either<Failure, RegisterExitResult>> {
    return this.remoteDs.closeSession(params);
  }

  async getActiveTariff(vehicleType: VehicleType): Promise<Either<Failure, TariffEntity>> {
    return this.remoteDs.getActiveTariff(vehicleType);
  }

  async listSessions(params: ListSessionsParams): Promise<Either<Failure, ListSessionsResult>> {
    return this.remoteDs.listSessions(params);
  }

  async cancelSession(params: CancelSessionParams): Promise<Either<Failure, ParkingSessionEntity>> {
    return this.remoteDs.cancelSession(params);
  }
}
