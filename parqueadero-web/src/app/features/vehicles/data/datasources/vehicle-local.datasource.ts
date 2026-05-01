import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NotFoundFailure, ServerFailure } from '../../../../core/either/failures';
import { PowerSyncService } from '../../../../core/services/powersync.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import { VehicleMapper, VehicleModel } from '../../../parking/data/models/vehicle.model';
import { CreateVehicleParams, ListVehiclesParams, UpdateVehicleParams } from '../../domain/repositories/vehicle.repository';
import { VehicleDataSource } from './vehicle.datasource';

// SQLite stores vehicle type in column "type"; VehicleModel uses "vehicle_type"
interface VehicleSqlRow extends Omit<VehicleModel, '_deleted' | 'vehicle_type'> {
  _deleted: number;
  type: string;
}

function rowToModel(r: VehicleSqlRow): VehicleModel {
  return { ...r, vehicle_type: r.type, _deleted: Boolean(r._deleted) };
}

@Injectable()
export class VehicleLocalDataSource extends VehicleDataSource {
  private get db() { return this.ps.db; }

  constructor(private readonly ps: PowerSyncService) { super(); }

  async list(params: ListVehiclesParams): Promise<Either<Failure, { data: VehicleEntity[]; pagination: PaginationMeta }>> {
    try {
      const page = params.pagination?.page ?? 1;
      const pageSize = params.pagination?.pageSize ?? 25;
      const conditions: string[] = ['(_deleted IS NULL OR _deleted = 0)'];
      const bindings: unknown[] = [];

      if (params.search) { conditions.push('plate LIKE ?'); bindings.push(`%${params.search}%`); }
      if (params.vehicleType) { conditions.push('type = ?'); bindings.push(params.vehicleType); }
      if (params.customerId) { conditions.push('owner_customer_id = ?'); bindings.push(params.customerId); }

      const where = conditions.join(' AND ');
      const offset = (page - 1) * pageSize;

      const count = await this.db.getAll<{ total: number }>(
        `SELECT COUNT(*) as total FROM vehicles WHERE ${where}`, bindings,
      );
      const total = count[0]?.total ?? 0;

      const rows = await this.db.getAll<VehicleSqlRow>(
        `SELECT * FROM vehicles WHERE ${where} ORDER BY plate ASC LIMIT ? OFFSET ?`,
        [...bindings, pageSize, offset],
      );

      return right({
        data: rows.map((r) => VehicleMapper.toEntity(rowToModel(r))),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
      });
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async findById(id: string): Promise<Either<Failure, VehicleEntity>> {
    try {
      const rows = await this.db.getAll<VehicleSqlRow>(
        `SELECT * FROM vehicles WHERE id = ? LIMIT 1`, [id],
      );
      if (!rows[0]) return left(new NotFoundFailure('Vehículo no encontrado', 'vehicle'));
      return right(VehicleMapper.toEntity(rowToModel(rows[0])));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async create(params: CreateVehicleParams): Promise<Either<Failure, VehicleEntity>> {
    try {
      const id = crypto.randomUUID();
      const ts = new Date().toISOString();
      await this.db.execute(
        `INSERT INTO vehicles (id, plate, type, color, brand, owner_customer_id, _deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          id, params.plate, params.vehicleType,
          params.color ?? null, params.brand ?? null,
          params.ownerCustomerId ?? null,
          ts, ts,
        ],
      );
      const rows = await this.db.getAll<VehicleSqlRow>('SELECT * FROM vehicles WHERE id = ?', [id]);
      if (!rows[0]) return left(new ServerFailure('Vehículo no encontrado tras insertar'));
      return right(VehicleMapper.toEntity(rowToModel(rows[0])));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async update(params: UpdateVehicleParams): Promise<Either<Failure, VehicleEntity>> {
    try {
      const ts = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const vals: unknown[] = [ts];
      if (params.color !== undefined) { sets.push('color = ?'); vals.push(params.color); }
      if (params.brand !== undefined) { sets.push('brand = ?'); vals.push(params.brand); }
      if (params.ownerCustomerId !== undefined) { sets.push('owner_customer_id = ?'); vals.push(params.ownerCustomerId); }
      vals.push(params.id);
      await this.db.execute(`UPDATE vehicles SET ${sets.join(', ')} WHERE id = ?`, vals);
      const rows = await this.db.getAll<VehicleSqlRow>('SELECT * FROM vehicles WHERE id = ?', [params.id]);
      if (!rows[0]) return left(new NotFoundFailure('Vehículo no encontrado', 'vehicle'));
      return right(VehicleMapper.toEntity(rowToModel(rows[0])));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async deactivate(id: string): Promise<Either<Failure, void>> {
    try {
      await this.db.execute(
        `UPDATE vehicles SET _deleted = 1, updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), id],
      );
      return right(undefined);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async existsByPlate(plate: string): Promise<Either<Failure, boolean>> {
    try {
      const rows = await this.db.getAll<{ c: number }>(
        `SELECT COUNT(*) as c FROM vehicles WHERE plate = ? AND (_deleted IS NULL OR _deleted = 0)`,
        [plate],
      );
      return right((rows[0]?.c ?? 0) > 0);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async hasActiveSession(plate: string): Promise<Either<Failure, boolean>> {
    try {
      const rows = await this.db.getAll<{ c: number }>(
        `SELECT COUNT(*) as c FROM parking_sessions
         WHERE vehicle_plate = ? AND status = 'active' AND (_deleted IS NULL OR _deleted = 0)`,
        [plate],
      );
      return right((rows[0]?.c ?? 0) > 0);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async hasActivePlan(plate: string): Promise<Either<Failure, boolean>> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await this.db.getAll<{ c: number }>(
        `SELECT COUNT(*) as c FROM monthly_plans
         WHERE vehicle_plate = ? AND status IN ('active', 'expiring')
         AND end_date >= ? AND (_deleted IS NULL OR _deleted = 0)`,
        [plate, today],
      );
      return right((rows[0]?.c ?? 0) > 0);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }
}
