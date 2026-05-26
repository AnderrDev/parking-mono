import { Inject, Injectable, inject } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, NetworkFailure } from '../../../../core/either/failures';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';
import { PaginatedResult } from '../../../../shared/models/pagination.model';
import { TariffDataSource } from '../datasources/tariff.datasource';
import {
  TariffRepository,
  ListTariffsParams,
  CreateTariffParams,
  UpdateTariffParams,
} from '../../domain/repositories/tariff.repository';
import { TARIFF_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { TariffLocalDataSource } from '../datasources/tariff-local.datasource';
import { NetworkInfoService } from '../../../../core/services/network-info.service';
import { LocalDbService } from '../../../../core/services/local-db.service';

// ──────────────────────────────────────────────────────────────────────────────
// TariffRepositoryImpl — cache-aware: lecturas pasan por remoto y se reflejan
// en el mirror Dexie como fallback; en NetworkFailure caen al local.
// Escrituras siempre van a Supabase (Sprint 1 read-only mirror).
// ──────────────────────────────────────────────────────────────────────────────
@Injectable()
export class TariffRepositoryImpl extends TariffRepository {
  private readonly localDs = inject(TariffLocalDataSource);
  private readonly networkInfo = inject(NetworkInfoService);
  private readonly localDb = inject(LocalDbService);

  constructor(
    @Inject(TARIFF_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: TariffDataSource,
  ) {
    super();
  }

  private writeMirror(entity: TariffEntity): void {
    const row = {
      id: entity.id,
      name: entity.name,
      vehicle_type: entity.vehicleType,
      unit: entity.unit,
      value_cents: entity.valueCents,
      grace_minutes: entity.graceMinutes,
      daily_cap_cents: entity.dailyCapCents,
      per_minute_cents: entity.perMinuteCents,
      per_hour_cents: entity.perHourCents,
      plena_cents: entity.plenaCents,
      schedule_json: entity.scheduleJson,
      valid_from: entity.validFrom ? entity.validFrom.toISOString().slice(0, 10) : null,
      valid_to: entity.validTo ? entity.validTo.toISOString().slice(0, 10) : null,
      is_active: entity.isActive ? 1 : 0,
      _deleted: false,
      created_at: entity.createdAt.toISOString(),
      updated_at: entity.updatedAt.toISOString(),
    };
    this.localDb
      .getDB()
      .tariffs.put(row as never)
      .catch((err) => console.warn('[TariffRepositoryImpl] writeMirror falló', err));
  }

  async list(params: ListTariffsParams): Promise<Either<Failure, PaginatedResult<TariffEntity>>> {
    if (!this.networkInfo.isOnline()) return this.localDs.list(params);
    const remote = await this.remoteDs.list(params);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.list(params);
    }
    return remote;
  }

  async findById(id: string): Promise<Either<Failure, TariffEntity | null>> {
    if (!this.networkInfo.isOnline()) return this.localDs.findById(id);
    const remote = await this.remoteDs.findById(id);
    if (remote.isRight()) {
      if (remote.value) this.writeMirror(remote.value);
      return remote;
    }
    if (remote.value instanceof NetworkFailure) return this.localDs.findById(id);
    return remote;
  }

  async create(params: CreateTariffParams): Promise<Either<Failure, TariffEntity>> {
    if (!this.networkInfo.isOnline()) return left(new NetworkFailure('No disponible offline'));
    const r = await this.remoteDs.create(params);
    if (r.isRight()) this.writeMirror(r.value);
    return r;
  }

  async update(id: string, params: UpdateTariffParams): Promise<Either<Failure, TariffEntity>> {
    if (!this.networkInfo.isOnline()) return left(new NetworkFailure('No disponible offline'));
    const r = await this.remoteDs.update(id, params);
    if (r.isRight()) this.writeMirror(r.value);
    return r;
  }

  async deactivate(id: string): Promise<Either<Failure, void>> {
    if (!this.networkInfo.isOnline()) return left(new NetworkFailure('No disponible offline'));
    const r = await this.remoteDs.deactivate(id);
    if (r.isRight()) {
      this.localDb
        .getDB()
        .tariffs.delete(id)
        .catch((err) => console.warn('[TariffRepositoryImpl] mirror delete falló', err));
    }
    return r;
  }

  async existsActive(name: string, vehicleType: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    if (!this.networkInfo.isOnline()) return this.localDs.existsActive(name, vehicleType, excludeId);
    const remote = await this.remoteDs.existsActive(name, vehicleType, excludeId);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.existsActive(name, vehicleType, excludeId);
    }
    return remote;
  }

  async existsActiveSameCategory(vehicleType: VehicleType, isMonthly: boolean, excludeId?: string): Promise<Either<Failure, boolean>> {
    if (!this.networkInfo.isOnline()) return this.localDs.existsActiveSameCategory(vehicleType, isMonthly, excludeId);
    const remote = await this.remoteDs.existsActiveSameCategory(vehicleType, isMonthly, excludeId);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.existsActiveSameCategory(vehicleType, isMonthly, excludeId);
    }
    return remote;
  }

  async getActiveMonthlyTariff(vehicleType: VehicleType): Promise<Either<Failure, TariffEntity | null>> {
    if (!this.networkInfo.isOnline()) return this.localDs.getActiveMonthlyTariff(vehicleType);
    const remote = await this.remoteDs.getActiveMonthlyTariff(vehicleType);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.getActiveMonthlyTariff(vehicleType);
    }
    return remote;
  }
}
