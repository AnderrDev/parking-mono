import { Inject, Injectable, inject } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, NetworkFailure } from '../../../../core/either/failures';
import { MONTHLY_PLAN_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import {
  MonthlyPlanRepository,
  CreateMonthlyPlanParams,
  ListMonthlyPlansParams,
  UpdateMonthlyPlanParams,
} from '../../domain/repositories/monthly-plan.repository';
import { MonthlyPlanDataSource } from '../datasources/monthly-plan.datasource';
import { MonthlyPlanLocalDataSource } from '../datasources/monthly-plan-local.datasource';
import { NetworkInfoService } from '../../../../core/services/network-info.service';
import { LocalDbService } from '../../../../core/services/local-db.service';

// ──────────────────────────────────────────────────────────────────────────────
// MonthlyPlanRepositoryImpl — cache-aware con mirror Dexie.
// El mirror solo refleja status active/expiring; expired/cancelled lo eliminan.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable()
export class MonthlyPlanRepositoryImpl extends MonthlyPlanRepository {
  private readonly localDs = inject(MonthlyPlanLocalDataSource);
  private readonly networkInfo = inject(NetworkInfoService);
  private readonly localDb = inject(LocalDbService);

  constructor(
    @Inject(MONTHLY_PLAN_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: MonthlyPlanDataSource,
  ) {
    super();
  }

  private writeMirror(entity: MonthlyPlanEntity): void {
    // Si el plan ya no está activo, mejor borrarlo del mirror.
    if (entity.status !== 'active' && entity.status !== 'expiring') {
      this.localDb
        .getDB()
        .monthly_plans.delete(entity.id)
        .catch((err) => console.warn('[MonthlyPlanRepositoryImpl] mirror prune falló', err));
      return;
    }
    const row = {
      id: entity.id,
      vehicle_plate: entity.vehiclePlate,
      customer_id: entity.customerId,
      status: entity.status,
      start_date: entity.startDate.toISOString().slice(0, 10),
      end_date: entity.endDate.toISOString().slice(0, 10),
      plan_type: entity.planType,
      amount_cents: entity.amountCents,
      auto_renew: entity.autoRenew,
      payment_token_id: entity.paymentTokenId,
      created_at: entity.createdAt.toISOString(),
      updated_at: entity.updatedAt.toISOString(),
      _deleted: entity.isDeleted,
    };
    this.localDb
      .getDB()
      .monthly_plans.put(row as never)
      .catch((err) => console.warn('[MonthlyPlanRepositoryImpl] writeMirror falló', err));
  }

  async list(
    params: ListMonthlyPlansParams,
  ): Promise<Either<Failure, { data: MonthlyPlanEntity[]; pagination: PaginationMeta }>> {
    if (!this.networkInfo.isOnline()) return this.localDs.list(params);
    const remote = await this.remoteDs.list(params);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.list(params);
    }
    return remote;
  }

  async findById(id: string): Promise<Either<Failure, MonthlyPlanEntity>> {
    if (!this.networkInfo.isOnline()) return this.localDs.findById(id);
    const remote = await this.remoteDs.findById(id);
    if (remote.isRight()) {
      this.writeMirror(remote.value);
      return remote;
    }
    if (remote.value instanceof NetworkFailure) return this.localDs.findById(id);
    return remote;
  }

  async create(params: CreateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> {
    if (!this.networkInfo.isOnline()) return left(new NetworkFailure('No disponible offline'));
    const r = await this.remoteDs.create(params);
    if (r.isRight()) this.writeMirror(r.value);
    return r;
  }

  async update(params: UpdateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> {
    if (!this.networkInfo.isOnline()) return left(new NetworkFailure('No disponible offline'));
    const r = await this.remoteDs.update(params);
    if (r.isRight()) this.writeMirror(r.value);
    return r;
  }

  async cancel(id: string): Promise<Either<Failure, void>> {
    if (!this.networkInfo.isOnline()) return left(new NetworkFailure('No disponible offline'));
    const r = await this.remoteDs.cancel(id);
    if (r.isRight()) {
      this.localDb
        .getDB()
        .monthly_plans.delete(id)
        .catch((err) => console.warn('[MonthlyPlanRepositoryImpl] mirror delete falló', err));
    }
    return r;
  }

  async hasActivePlanForPlate(plate: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    if (!this.networkInfo.isOnline()) return this.localDs.hasActivePlanForPlate(plate, excludeId);
    const remote = await this.remoteDs.hasActivePlanForPlate(plate, excludeId);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.hasActivePlanForPlate(plate, excludeId);
    }
    return remote;
  }
}
