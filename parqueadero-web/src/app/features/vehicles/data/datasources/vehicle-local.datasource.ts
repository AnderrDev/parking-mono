import { Injectable, inject } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, NotFoundFailure } from '../../../../core/either/failures';
import { LocalDbService } from '../../../../core/services/local-db.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import {
  VehicleMapper,
  VehicleModel as RemoteVehicleModel,
} from '../../../parking/data/models/vehicle.model';
import {
  CreateVehicleParams,
  ListVehiclesParams,
  UpdateVehicleParams,
} from '../../domain/repositories/vehicle.repository';
import { VehicleDataSource } from './vehicle.datasource';

// ──────────────────────────────────────────────────────────────────────────────
// VehicleLocalDataSource — lectura desde el mirror Dexie. Sprint 1.
// La columna real en Supabase es `type`; el mapper espera `vehicle_type`.
// Traducimos antes de mapear.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class VehicleLocalDataSource extends VehicleDataSource {
  private readonly localDb = inject(LocalDbService);

  private toModel(row: unknown): RemoteVehicleModel {
    const r = row as Record<string, unknown>;
    return { ...r, vehicle_type: r['vehicle_type'] ?? r['type'] } as RemoteVehicleModel;
  }

  async list(
    params: ListVehiclesParams,
  ): Promise<Either<Failure, { data: VehicleEntity[]; pagination: PaginationMeta }>> {
    try {
      const db = this.localDb.getDB();
      let rows = await db.vehicles.toArray();

      rows = rows.filter((r) => r['_deleted'] !== true);

      if (params.search) {
        const needle = params.search.toUpperCase();
        rows = rows.filter((r) =>
          String(r['plate'] ?? '').toUpperCase().includes(needle),
        );
      }
      if (params.vehicleType) {
        rows = rows.filter((r) => (r['type'] ?? r['vehicle_type']) === params.vehicleType);
      }
      if (params.customerId) {
        rows = rows.filter((r) => r['owner_customer_id'] === params.customerId);
      }

      const sortField = params.sort?.field ?? 'plate';
      const sortDir = params.sort?.direction ?? 'asc';
      rows.sort((a, b) => {
        const av = a[sortField];
        const bv = b[sortField];
        if (av == null && bv == null) return 0;
        if (av == null) return sortDir === 'asc' ? -1 : 1;
        if (bv == null) return sortDir === 'asc' ? 1 : -1;
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });

      const page = params.pagination?.page ?? 1;
      const pageSize = params.pagination?.pageSize ?? 25;
      const total = rows.length;
      const slice = rows.slice((page - 1) * pageSize, page * pageSize);

      return right({
        data: slice.map((r) => VehicleMapper.toEntity(this.toModel(r))),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (e) {
      return left(new NetworkFailure(`Error leyendo vehículos locales: ${String(e)}`));
    }
  }

  async findById(id: string): Promise<Either<Failure, VehicleEntity>> {
    try {
      const row = await this.localDb.getDB().vehicles.get(id);
      if (!row) return left(new NotFoundFailure('Vehículo no encontrado'));
      return right(VehicleMapper.toEntity(this.toModel(row)));
    } catch (e) {
      return left(new NetworkFailure(`Error leyendo vehículo local: ${String(e)}`));
    }
  }

  async create(_params: CreateVehicleParams): Promise<Either<Failure, VehicleEntity>> {
    return left(new NetworkFailure('No disponible offline'));
  }

  async update(_params: UpdateVehicleParams): Promise<Either<Failure, VehicleEntity>> {
    return left(new NetworkFailure('No disponible offline'));
  }

  async deactivate(_id: string): Promise<Either<Failure, void>> {
    return left(new NetworkFailure('No disponible offline'));
  }

  async existsByPlate(plate: string): Promise<Either<Failure, boolean>> {
    try {
      const rows = await this.localDb.getDB().vehicles.toArray();
      const hit = rows.find((r) => r['plate'] === plate && r['_deleted'] !== true);
      return right(!!hit);
    } catch (e) {
      return left(new NetworkFailure(`Error consultando vehículo local: ${String(e)}`));
    }
  }

  async hasActiveSession(_plate: string): Promise<Either<Failure, boolean>> {
    // parking_sessions no está en el mirror de Sprint 1 (entra en Sprint 2).
    // Devolvemos false defensivamente; la fuente de verdad sigue siendo remota.
    console.warn(
      '[VehicleLocalDataSource] hasActiveSession no disponible offline (Sprint 2). Retornando false.',
    );
    return right(false);
  }

  async hasActivePlan(plate: string): Promise<Either<Failure, boolean>> {
    try {
      const rows = await this.localDb.getDB().monthly_plans.toArray();
      const hit = rows.find(
        (r) =>
          r['vehicle_plate'] === plate &&
          (r['status'] === 'active' || r['status'] === 'expiring'),
      );
      return right(!!hit);
    } catch (e) {
      return left(new NetworkFailure(`Error consultando plan local: ${String(e)}`));
    }
  }
}
