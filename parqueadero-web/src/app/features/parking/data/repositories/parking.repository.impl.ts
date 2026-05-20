import { Inject, Injectable, inject } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure, NetworkFailure } from '../../../../core/either/failures';
import { PARKING_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { NetworkInfoService } from '../../../../core/services/network-info.service';
import { PaginationMeta as Pagination } from '../../../../shared/models/pagination.model';
import { ParkingSessionEntity, VehicleType } from '../../domain/entities/parking-session.entity';
import { VehicleEntity } from '../../domain/entities/vehicle.entity';
import { MonthlyPlanEntity } from '../../domain/entities/monthly-plan.entity';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import { VehicleHistoryStats } from '../../domain/entities/vehicle-history-stats.entity';
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
import { ParkingLocalDataSource } from '../datasources/parking-local.datasource';
import { LocalDbService } from '../../../../core/services/local-db.service';

// ──────────────────────────────────────────────────────────────────────────────
// ParkingRepositoryImpl — Sprint 2.
//
// Patrón "optimista write-through con fallback offline":
//   - Si online → intenta remoto. Si éxito → reflejamos al mirror local
//     con `_sync_status='synced'` (best-effort). Si NetworkFailure → cae al
//     path offline (escritura local + outbox). Si ServerFailure → propaga
//     al UC (decisión: no encolar si el server rechazó con detalle).
//   - Si offline → directo al path local + outbox.
//
// Las lecturas siguen el mismo principio: online primero, fallback al mirror
// si NetworkFailure. Si online retorna éxito, NO refrescamos el mirror desde
// aquí — el snapshot pull/Realtime ya lo mantienen al día.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable()
export class ParkingRepositoryImpl extends ParkingRepository {
  private readonly localDs = inject(ParkingLocalDataSource);
  private readonly networkInfo = inject(NetworkInfoService);
  private readonly localDb = inject(LocalDbService);

  constructor(
    @Inject(PARKING_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: ParkingDataSource,
  ) {
    super();
  }

  async registerEntry(
    params: RegisterEntryParams,
  ): Promise<Either<Failure, ParkingSessionEntity>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.insertSession(params);
    }
    const remote = await this.remoteDs.insertSession(params);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.insertSession(params);
    }
    return remote;
  }

  async getActiveSessionByPlate(
    plate: string,
  ): Promise<Either<Failure, ParkingSessionEntity | null>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.getActiveSessionByPlate(plate);
    }
    const remote = await this.remoteDs.getActiveSessionByPlate(plate);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.getActiveSessionByPlate(plate);
    }
    return remote;
  }

  async getActiveSessions(
    filter: ActiveSessionsFilter,
    pagination: { page: number; pageSize: number },
    sort: ActiveSessionsSort,
  ): Promise<Either<Failure, ActiveSessionsResult>> {
    const exec = async () => {
      if (!this.networkInfo.isOnline()) {
        return this.localDs.getActiveSessions(filter, pagination, sort);
      }
      const remote = await this.remoteDs.getActiveSessions(filter, pagination, sort);
      if (remote.isLeft() && remote.value instanceof NetworkFailure) {
        return this.localDs.getActiveSessions(filter, pagination, sort);
      }
      return remote;
    };
    const result = await exec();
    return result.map((page) => ({
      data: page.data,
      pagination: page.pagination as Pagination,
    }));
  }

  async searchVehicleByPlate(plate: string): Promise<Either<Failure, VehicleSearchResult>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.searchVehicle(plate);
    }
    const remote = await this.remoteDs.searchVehicle(plate);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.searchVehicle(plate);
    }
    return remote;
  }

  async searchPlateSuggestions(
    query: string,
    limit = 8,
    onlyActive = false,
  ): Promise<Either<Failure, VehicleEntity[]>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.searchPlateSuggestions(query, limit, onlyActive);
    }
    const remote = await this.remoteDs.searchPlateSuggestions(query, limit, onlyActive);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.searchPlateSuggestions(query, limit, onlyActive);
    }
    return remote;
  }

  async getVehicleHistoryStats(
    plate: string,
    recentLimit = 5,
  ): Promise<Either<Failure, VehicleHistoryStats>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.getVehicleHistoryStats(plate, recentLimit);
    }
    const remote = await this.remoteDs.getVehicleHistoryStats(plate, recentLimit);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.getVehicleHistoryStats(plate, recentLimit);
    }
    return remote;
  }

  async getOpenCashierShiftId(userId: string): Promise<Either<Failure, string | null>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.getOpenCashierShiftId(userId);
    }
    const remote = await this.remoteDs.getOpenCashierShiftId(userId);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.getOpenCashierShiftId(userId);
    }
    return remote;
  }

  async getOpenShiftSummary(
    userId: string,
  ): Promise<Either<Failure, OpenShiftSummary | null>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.getOpenShiftSummary(userId);
    }
    const remote = await this.remoteDs.getOpenShiftSummary(userId);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.getOpenShiftSummary(userId);
    }
    return remote;
  }

  async getActivePlanByPlate(plate: string): Promise<Either<Failure, MonthlyPlanEntity | null>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.getActivePlanByPlate(plate);
    }
    const remote = await this.remoteDs.getActivePlanByPlate(plate);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.getActivePlanByPlate(plate);
    }
    return remote;
  }

  async registerExit(params: RegisterExitParams): Promise<Either<Failure, RegisterExitResult>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.closeSession(params);
    }
    const remote = await this.remoteDs.closeSession(params);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.closeSession(params);
    }
    return remote;
  }

  async getActiveTariff(vehicleType: VehicleType): Promise<Either<Failure, TariffEntity>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.getActiveTariff(vehicleType);
    }
    const remote = await this.remoteDs.getActiveTariff(vehicleType);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.getActiveTariff(vehicleType);
    }
    return remote;
  }

  async listSessions(params: ListSessionsParams): Promise<Either<Failure, ListSessionsResult>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.listSessions(params);
    }
    const remote = await this.remoteDs.listSessions(params);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.listSessions(params);
    }
    return remote;
  }

  async cancelSession(params: CancelSessionParams): Promise<Either<Failure, ParkingSessionEntity>> {
    // Sprint 3: si caemos al path offline, intentamos resolver el paymentId
    // localmente para que el datasource pueda encolar el refund. El server
    // lo hace inline en el path remoto.
    const fallback = async () => {
      let paymentId = params.paymentId;
      if (!paymentId) {
        try {
          const payment = await this.localDb
            .getDB()
            .payments.where('session_id')
            .equals(params.sessionId)
            .first();
          paymentId = (payment as { id?: string } | undefined)?.id;
        } catch {
          // Sin payment local: cancelamos solo la sesión, el refund lo
          // resolverá el server cuando recupere conexión.
        }
      }
      const next: CancelSessionParams = paymentId
        ? { ...params, paymentId }
        : { ...params };
      return this.localDs.cancelSession(next);
    };

    if (!this.networkInfo.isOnline()) {
      return fallback();
    }
    const remote = await this.remoteDs.cancelSession(params);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return fallback();
    }
    return remote;
  }
}
