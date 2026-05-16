import { Inject, Injectable, inject } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, NetworkFailure } from '../../../../core/either/failures';
import { VEHICLE_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import {
  VehicleRepository,
  CreateVehicleParams,
  ListVehiclesParams,
  UpdateVehicleParams,
} from '../../domain/repositories/vehicle.repository';
import { VehicleDataSource } from '../datasources/vehicle.datasource';
import { VehicleLocalDataSource } from '../datasources/vehicle-local.datasource';
import { NetworkInfoService } from '../../../../core/services/network-info.service';
import { LocalDbService } from '../../../../core/services/local-db.service';

// ──────────────────────────────────────────────────────────────────────────────
// VehicleRepositoryImpl — cache-aware con mirror Dexie. Sprint 1 Fase 8.
// La tabla en Supabase usa columna `type`; el mirror la persiste igual.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable()
export class VehicleRepositoryImpl extends VehicleRepository {
  private readonly localDs = inject(VehicleLocalDataSource);
  private readonly networkInfo = inject(NetworkInfoService);
  private readonly localDb = inject(LocalDbService);

  constructor(
    @Inject(VEHICLE_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: VehicleDataSource,
  ) {
    super();
  }

  private writeMirror(entity: VehicleEntity): void {
    const row = {
      id: entity.id,
      plate: entity.plate,
      type: entity.vehicleType,
      vehicle_type: entity.vehicleType,
      color: entity.color,
      brand: entity.brand,
      owner_customer_id: entity.ownerCustomerId,
      created_at: entity.createdAt.toISOString(),
      updated_at: entity.updatedAt.toISOString(),
      _deleted: entity.isDeleted,
    };
    this.localDb
      .getDB()
      .vehicles.put(row as never)
      .catch((err) => console.warn('[VehicleRepositoryImpl] writeMirror falló', err));
  }

  async list(
    params: ListVehiclesParams,
  ): Promise<Either<Failure, { data: VehicleEntity[]; pagination: PaginationMeta }>> {
    if (!this.networkInfo.isOnline()) return this.localDs.list(params);
    const remote = await this.remoteDs.list(params);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.list(params);
    }
    return remote;
  }

  async findById(id: string): Promise<Either<Failure, VehicleEntity>> {
    if (!this.networkInfo.isOnline()) return this.localDs.findById(id);
    const remote = await this.remoteDs.findById(id);
    if (remote.isRight()) {
      this.writeMirror(remote.value);
      return remote;
    }
    if (remote.value instanceof NetworkFailure) return this.localDs.findById(id);
    return remote;
  }

  async create(params: CreateVehicleParams): Promise<Either<Failure, VehicleEntity>> {
    if (!this.networkInfo.isOnline()) return left(new NetworkFailure('No disponible offline'));
    const r = await this.remoteDs.create(params);
    if (r.isRight()) this.writeMirror(r.value);
    return r;
  }

  async update(params: UpdateVehicleParams): Promise<Either<Failure, VehicleEntity>> {
    if (!this.networkInfo.isOnline()) return left(new NetworkFailure('No disponible offline'));
    const r = await this.remoteDs.update(params);
    if (r.isRight()) this.writeMirror(r.value);
    return r;
  }

  async deactivate(id: string): Promise<Either<Failure, void>> {
    if (!this.networkInfo.isOnline()) return left(new NetworkFailure('No disponible offline'));
    const r = await this.remoteDs.deactivate(id);
    if (r.isRight()) {
      this.localDb
        .getDB()
        .vehicles.delete(id)
        .catch((err) => console.warn('[VehicleRepositoryImpl] mirror delete falló', err));
    }
    return r;
  }

  async existsByPlate(plate: string): Promise<Either<Failure, boolean>> {
    if (!this.networkInfo.isOnline()) return this.localDs.existsByPlate(plate);
    const remote = await this.remoteDs.existsByPlate(plate);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.existsByPlate(plate);
    }
    return remote;
  }

  async hasActiveSession(plate: string): Promise<Either<Failure, boolean>> {
    if (!this.networkInfo.isOnline()) return this.localDs.hasActiveSession(plate);
    const remote = await this.remoteDs.hasActiveSession(plate);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.hasActiveSession(plate);
    }
    return remote;
  }

  async hasActivePlan(plate: string): Promise<Either<Failure, boolean>> {
    if (!this.networkInfo.isOnline()) return this.localDs.hasActivePlan(plate);
    const remote = await this.remoteDs.hasActivePlan(plate);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.hasActivePlan(plate);
    }
    return remote;
  }
}
