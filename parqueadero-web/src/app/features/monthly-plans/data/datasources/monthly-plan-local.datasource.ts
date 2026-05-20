import { Injectable, inject } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, NotFoundFailure } from '../../../../core/either/failures';
import { LocalDbService } from '../../../../core/services/local-db.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import {
  MonthlyPlanMapper,
  MonthlyPlanModel as RemoteMonthlyPlanModel,
} from '../../../parking/data/models/monthly-plan.model';
import {
  CreateMonthlyPlanParams,
  ListMonthlyPlansParams,
  UpdateMonthlyPlanParams,
} from '../../domain/repositories/monthly-plan.repository';
import { MonthlyPlanDataSource } from './monthly-plan.datasource';

// ──────────────────────────────────────────────────────────────────────────────
// MonthlyPlanLocalDataSource — lectura desde el mirror Dexie. Sprint 1.
// El snapshot/realtime sólo trae status 'active' | 'expiring' y _deleted=false.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class MonthlyPlanLocalDataSource extends MonthlyPlanDataSource {
  private readonly localDb = inject(LocalDbService);

  async list(
    params: ListMonthlyPlansParams,
  ): Promise<Either<Failure, { data: MonthlyPlanEntity[]; pagination: PaginationMeta }>> {
    try {
      const db = this.localDb.getDB();
      let rows = await db.monthly_plans.toArray();

      if (params.search) {
        const needle = params.search.toLowerCase();
        rows = rows.filter((r) =>
          String(r['vehicle_plate'] ?? '').toLowerCase().includes(needle),
        );
      }
      if (params.status) {
        rows = rows.filter((r) => r['status'] === params.status);
      }
      if (params.customerId) {
        rows = rows.filter((r) => r['customer_id'] === params.customerId);
      }

      const sortField = params.sort?.field ?? 'end_date';
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
        data: slice.map((r) => MonthlyPlanMapper.toEntity(r as unknown as RemoteMonthlyPlanModel)),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (e) {
      return left(new NetworkFailure(`Error leyendo planes locales: ${String(e)}`));
    }
  }

  async findById(id: string): Promise<Either<Failure, MonthlyPlanEntity>> {
    try {
      const row = await this.localDb.getDB().monthly_plans.get(id);
      if (!row) return left(new NotFoundFailure('Plan no encontrado'));
      return right(MonthlyPlanMapper.toEntity(row as unknown as RemoteMonthlyPlanModel));
    } catch (e) {
      return left(new NetworkFailure(`Error leyendo plan local: ${String(e)}`));
    }
  }

  async create(_params: CreateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> {
    return left(new NetworkFailure('No disponible offline'));
  }

  async update(_params: UpdateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> {
    return left(new NetworkFailure('No disponible offline'));
  }

  async cancel(_id: string): Promise<Either<Failure, void>> {
    return left(new NetworkFailure('No disponible offline'));
  }

  async hasActivePlanForPlate(plate: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    try {
      const rows = await this.localDb.getDB().monthly_plans.toArray();
      const hit = rows.find(
        (r) =>
          r['vehicle_plate'] === plate &&
          (r['status'] === 'active' || r['status'] === 'expiring') &&
          (excludeId ? r.id !== excludeId : true),
      );
      return right(!!hit);
    } catch (e) {
      return left(new NetworkFailure(`Error consultando plan local: ${String(e)}`));
    }
  }
}
