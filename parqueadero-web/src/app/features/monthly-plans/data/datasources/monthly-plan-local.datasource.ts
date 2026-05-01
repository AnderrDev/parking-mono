import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NotFoundFailure, ServerFailure } from '../../../../core/either/failures';
import { PowerSyncService } from '../../../../core/services/powersync.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { MonthlyPlanMapper, MonthlyPlanModel } from '../../../parking/data/models/monthly-plan.model';
import {
  CreateMonthlyPlanParams,
  ListMonthlyPlansParams,
  UpdateMonthlyPlanParams,
} from '../../domain/repositories/monthly-plan.repository';
import { MonthlyPlanDataSource } from './monthly-plan.datasource';

interface PlanSqlRow extends Omit<MonthlyPlanModel, 'auto_renew' | '_deleted'> {
  auto_renew: number;
  _deleted: number;
}

function rowToModel(r: PlanSqlRow): MonthlyPlanModel {
  return { ...r, auto_renew: Boolean(r.auto_renew), _deleted: Boolean(r._deleted) };
}

@Injectable()
export class MonthlyPlanLocalDataSource extends MonthlyPlanDataSource {
  private get db() { return this.ps.db; }

  constructor(private readonly ps: PowerSyncService) { super(); }

  async list(params: ListMonthlyPlansParams): Promise<Either<Failure, { data: MonthlyPlanEntity[]; pagination: PaginationMeta }>> {
    try {
      const page = params.pagination?.page ?? 1;
      const pageSize = params.pagination?.pageSize ?? 25;
      const conditions: string[] = ['(_deleted IS NULL OR _deleted = 0)'];
      const bindings: unknown[] = [];

      if (params.search) { conditions.push('vehicle_plate LIKE ?'); bindings.push(`%${params.search}%`); }
      if (params.status) { conditions.push('status = ?'); bindings.push(params.status); }
      if (params.customerId) { conditions.push('customer_id = ?'); bindings.push(params.customerId); }

      const where = conditions.join(' AND ');
      const offset = (page - 1) * pageSize;

      const count = await this.db.getAll<{ total: number }>(
        `SELECT COUNT(*) as total FROM monthly_plans WHERE ${where}`, bindings,
      );
      const total = count[0]?.total ?? 0;

      const rows = await this.db.getAll<PlanSqlRow>(
        `SELECT * FROM monthly_plans WHERE ${where} ORDER BY end_date ASC LIMIT ? OFFSET ?`,
        [...bindings, pageSize, offset],
      );

      return right({
        data: rows.map((r) => MonthlyPlanMapper.toEntity(rowToModel(r))),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
      });
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async findById(id: string): Promise<Either<Failure, MonthlyPlanEntity>> {
    try {
      const rows = await this.db.getAll<PlanSqlRow>(
        `SELECT * FROM monthly_plans WHERE id = ? LIMIT 1`, [id],
      );
      if (!rows[0]) return left(new NotFoundFailure('Plan mensual no encontrado', 'monthly_plan'));
      return right(MonthlyPlanMapper.toEntity(rowToModel(rows[0])));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async create(params: CreateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> {
    try {
      const id = crypto.randomUUID();
      const ts = new Date().toISOString();
      await this.db.execute(
        `INSERT INTO monthly_plans
          (id, customer_id, vehicle_plate, plan_type, start_date, end_date,
           amount_cents, status, auto_renew, _deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, ?, ?)`,
        [
          id, params.customerId, params.vehiclePlate, params.planType,
          params.startDate.toISOString().slice(0, 10),
          params.endDate.toISOString().slice(0, 10),
          params.amountCents,
          params.autoRenew ? 1 : 0,
          ts, ts,
        ],
      );
      const rows = await this.db.getAll<PlanSqlRow>('SELECT * FROM monthly_plans WHERE id = ?', [id]);
      if (!rows[0]) return left(new ServerFailure('Plan mensual no encontrado tras insertar'));
      return right(MonthlyPlanMapper.toEntity(rowToModel(rows[0])));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async update(params: UpdateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> {
    try {
      const ts = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const vals: unknown[] = [ts];
      if (params.endDate !== undefined) { sets.push('end_date = ?'); vals.push(params.endDate.toISOString().slice(0, 10)); }
      if (params.autoRenew !== undefined) { sets.push('auto_renew = ?'); vals.push(params.autoRenew ? 1 : 0); }
      if (params.amountCents !== undefined) { sets.push('amount_cents = ?'); vals.push(params.amountCents); }
      vals.push(params.id);
      await this.db.execute(`UPDATE monthly_plans SET ${sets.join(', ')} WHERE id = ?`, vals);
      const rows = await this.db.getAll<PlanSqlRow>('SELECT * FROM monthly_plans WHERE id = ?', [params.id]);
      if (!rows[0]) return left(new NotFoundFailure('Plan mensual no encontrado', 'monthly_plan'));
      return right(MonthlyPlanMapper.toEntity(rowToModel(rows[0])));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async cancel(id: string): Promise<Either<Failure, void>> {
    try {
      await this.db.execute(
        `UPDATE monthly_plans SET status = 'cancelled', _deleted = 1, updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), id],
      );
      return right(undefined);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async hasActivePlanForPlate(plate: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      let sql = `SELECT COUNT(*) as c FROM monthly_plans
                 WHERE vehicle_plate = ? AND status IN ('active', 'expiring')
                 AND end_date >= ? AND (_deleted IS NULL OR _deleted = 0)`;
      const bindings: unknown[] = [plate, today];
      if (excludeId) { sql += ' AND id != ?'; bindings.push(excludeId); }
      const rows = await this.db.getAll<{ c: number }>(sql, bindings);
      return right((rows[0]?.c ?? 0) > 0);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }
}
