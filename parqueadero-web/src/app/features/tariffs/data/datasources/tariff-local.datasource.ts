import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, NotFoundFailure, ServerFailure } from '../../../../core/either/failures';
import { PowerSyncService } from '../../../../core/services/powersync.service';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { PaginatedResult } from '../../../../shared/models/pagination.model';
import { TariffMapper, TariffModel } from '../../../parking/data/models/tariff.model';
import { TariffDataSource } from './tariff.datasource';
import {
  ListTariffsParams,
  CreateTariffParams,
  UpdateTariffParams,
} from '../../domain/repositories/tariff.repository';

interface TariffSqlRow extends Omit<TariffModel, 'is_active' | '_deleted' | 'schedule_json'> {
  is_active: number;
  _deleted: number;
  schedule_json: string;
}

function rowToModel(r: TariffSqlRow): TariffModel {
  return {
    ...r,
    is_active: Boolean(r.is_active),
    _deleted: Boolean(r._deleted),
    schedule_json: r.schedule_json
      ? JSON.parse(r.schedule_json) as Record<string, string>
      : { 'lunes-domingo': '00:00-23:59' },
  };
}

@Injectable()
export class TariffLocalDataSource extends TariffDataSource {
  private get db() { return this.ps.db; }

  constructor(private readonly ps: PowerSyncService) { super(); }

  async list(params: ListTariffsParams): Promise<Either<Failure, PaginatedResult<TariffEntity>>> {
    try {
      const page = params.pagination?.page ?? 1;
      const pageSize = params.pagination?.pageSize ?? 25;
      const conditions: string[] = ['(_deleted IS NULL OR _deleted = 0)'];
      const bindings: unknown[] = [];

      if (params.vehicleType) { conditions.push('vehicle_type = ?'); bindings.push(params.vehicleType); }
      if (params.isActive !== undefined) { conditions.push('is_active = ?'); bindings.push(params.isActive ? 1 : 0); }

      const where = conditions.join(' AND ');
      const offset = (page - 1) * pageSize;

      const count = await this.db.getAll<{ total: number }>(
        `SELECT COUNT(*) as total FROM tariffs WHERE ${where}`, bindings,
      );
      const total = count[0]?.total ?? 0;

      const rows = await this.db.getAll<TariffSqlRow>(
        `SELECT * FROM tariffs WHERE ${where} ORDER BY name ASC LIMIT ? OFFSET ?`,
        [...bindings, pageSize, offset],
      );

      return right({
        data: rows.map((r) => TariffMapper.toEntity(rowToModel(r))),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
      });
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async findById(id: string): Promise<Either<Failure, TariffEntity | null>> {
    try {
      const rows = await this.db.getAll<TariffSqlRow>(
        `SELECT * FROM tariffs WHERE id = ? AND (_deleted IS NULL OR _deleted = 0) LIMIT 1`,
        [id],
      );
      return right(rows[0] ? TariffMapper.toEntity(rowToModel(rows[0])) : null);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async create(params: CreateTariffParams): Promise<Either<Failure, TariffEntity>> {
    try {
      const id = crypto.randomUUID();
      const ts = new Date().toISOString();
      await this.db.execute(
        `INSERT INTO tariffs
          (id, name, vehicle_type, unit, value_cents, grace_minutes, daily_cap_cents,
           schedule_json, valid_from, valid_to, is_active, _deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        [
          id, params.name, params.vehicleType, params.unit,
          params.valueCents, params.graceMinutes, params.dailyCapCents,
          JSON.stringify(params.scheduleJson ?? { 'lunes-domingo': '00:00-23:59' }),
          params.validFrom?.toISOString().slice(0, 10) ?? null,
          params.validTo?.toISOString().slice(0, 10) ?? null,
          ts, ts,
        ],
      );
      const rows = await this.db.getAll<TariffSqlRow>('SELECT * FROM tariffs WHERE id = ?', [id]);
      if (!rows[0]) return left(new ServerFailure('Tarifa no encontrada tras insertar'));
      return right(TariffMapper.toEntity(rowToModel(rows[0])));
    } catch (err) {
      return left(new NetworkFailure(String(err)));
    }
  }

  async update(id: string, params: UpdateTariffParams): Promise<Either<Failure, TariffEntity>> {
    try {
      const ts = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const vals: unknown[] = [ts];
      if (params.name !== undefined) { sets.push('name = ?'); vals.push(params.name); }
      if (params.valueCents !== undefined) { sets.push('value_cents = ?'); vals.push(params.valueCents); }
      if (params.graceMinutes !== undefined) { sets.push('grace_minutes = ?'); vals.push(params.graceMinutes); }
      if (params.dailyCapCents !== undefined) { sets.push('daily_cap_cents = ?'); vals.push(params.dailyCapCents); }
      if (params.isActive !== undefined) { sets.push('is_active = ?'); vals.push(params.isActive ? 1 : 0); }
      vals.push(id);
      await this.db.execute(`UPDATE tariffs SET ${sets.join(', ')} WHERE id = ?`, vals);
      const rows = await this.db.getAll<TariffSqlRow>('SELECT * FROM tariffs WHERE id = ?', [id]);
      if (!rows[0]) return left(new NotFoundFailure('Tarifa no encontrada', 'tariff'));
      return right(TariffMapper.toEntity(rowToModel(rows[0])));
    } catch (err) {
      return left(new NetworkFailure(String(err)));
    }
  }

  async deactivate(id: string): Promise<Either<Failure, void>> {
    try {
      await this.db.execute(
        `UPDATE tariffs SET _deleted = 1, is_active = 0, updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), id],
      );
      return right(undefined);
    } catch (err) {
      return left(new NetworkFailure(String(err)));
    }
  }

  async existsActive(name: string, vehicleType: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    try {
      let sql = `SELECT COUNT(*) as c FROM tariffs WHERE name = ? AND vehicle_type = ? AND is_active = 1 AND (_deleted IS NULL OR _deleted = 0)`;
      const bindings: unknown[] = [name, vehicleType];
      if (excludeId) { sql += ' AND id != ?'; bindings.push(excludeId); }
      const rows = await this.db.getAll<{ c: number }>(sql, bindings);
      return right((rows[0]?.c ?? 0) > 0);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }
}
