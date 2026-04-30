import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, NotFoundFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { MonthlyPlanMapper, MonthlyPlanModel } from '../../../parking/data/models/monthly-plan.model';
import { CreateMonthlyPlanParams, ListMonthlyPlansParams, UpdateMonthlyPlanParams } from '../../domain/repositories/monthly-plan.repository';
import { MonthlyPlanDataSource } from './monthly-plan.datasource';

const EXPIRING_THRESHOLD_DAYS = 5;

@Injectable()
export class MonthlyPlanRemoteDataSource extends MonthlyPlanDataSource {
  constructor(private readonly supabase: SupabaseService) { super(); }

  async list(params: ListMonthlyPlansParams): Promise<Either<Failure, { data: MonthlyPlanEntity[]; pagination: PaginationMeta }>> {
    try {
      const page = params.pagination?.page ?? 1;
      const pageSize = params.pagination?.pageSize ?? 25;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = this.supabase.client.from('monthly_plans').select('*', { count: 'exact' }).eq('_deleted', false);

      if (params.search) query = query.ilike('vehicle_plate', `%${params.search}%`);
      if (params.status) query = query.eq('status', params.status);
      if (params.customerId) query = query.eq('customer_id', params.customerId);

      const sortField = params.sort?.field ?? 'end_date';
      const sortDir = params.sort?.direction ?? 'asc';
      query = query.order(sortField, { ascending: sortDir === 'asc' }).range(from, to);

      const { data, error, count } = await query;
      if (error) return left(new ServerFailure(error.message));

      const rows = (data ?? []) as MonthlyPlanModel[];
      const total = count ?? 0;
      return right({
        data: rows.map(MonthlyPlanMapper.toEntity),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async findById(id: string): Promise<Either<Failure, MonthlyPlanEntity>> {
    try {
      const { data, error } = await this.supabase.client
        .from('monthly_plans').select('*').eq('id', id).single();
      if (error) {
        return error.code === 'PGRST116'
          ? left(new NotFoundFailure('Plan no encontrado'))
          : left(new ServerFailure(error.message));
      }
      return right(MonthlyPlanMapper.toEntity(data as MonthlyPlanModel));
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async create(params: CreateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = new Date(params.endDate);
      endDate.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86_400_000);
      const status = daysLeft <= EXPIRING_THRESHOLD_DAYS ? 'expiring' : 'active';

      const payload: Record<string, unknown> = {
        vehicle_plate: params.vehiclePlate,
        customer_id: params.customerId,
        plan_type: params.planType,
        start_date: params.startDate.toISOString().slice(0, 10),
        end_date: params.endDate.toISOString().slice(0, 10),
        amount_cents: params.amountCents,
        status,
        auto_renew: params.autoRenew ?? false,
      };
      if (params.paymentTokenId) payload['payment_token_id'] = params.paymentTokenId;

      const { data, error } = await this.supabase.client
        .from('monthly_plans').insert(payload).select().single();
      if (error) return left(new ServerFailure(error.message));
      return right(MonthlyPlanMapper.toEntity(data as MonthlyPlanModel));
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async update(params: UpdateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> {
    try {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (params.endDate !== undefined) {
        patch['end_date'] = params.endDate.toISOString().slice(0, 10);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(params.endDate);
        endDate.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86_400_000);
        patch['status'] = daysLeft <= EXPIRING_THRESHOLD_DAYS ? 'expiring' : 'active';
      }
      if (params.autoRenew !== undefined) patch['auto_renew'] = params.autoRenew;
      if ('paymentTokenId' in params) patch['payment_token_id'] = params.paymentTokenId ?? null;
      if (params.amountCents !== undefined) patch['amount_cents'] = params.amountCents;

      const { data, error } = await this.supabase.client
        .from('monthly_plans').update(patch).eq('id', params.id).select().single();
      if (error) return left(new ServerFailure(error.message));
      return right(MonthlyPlanMapper.toEntity(data as MonthlyPlanModel));
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async cancel(id: string): Promise<Either<Failure, void>> {
    try {
      const { error } = await this.supabase.client
        .from('monthly_plans')
        .update({ status: 'cancelled', _deleted: true, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return left(new ServerFailure(error.message));
      return right(undefined);
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async hasActivePlanForPlate(plate: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    try {
      let query = this.supabase.client
        .from('monthly_plans').select('id', { count: 'exact', head: true })
        .eq('vehicle_plate', plate).in('status', ['active', 'expiring']).eq('_deleted', false);
      if (excludeId) query = query.neq('id', excludeId);
      const { count, error } = await query;
      if (error) return left(new ServerFailure(error.message));
      return right((count ?? 0) > 0);
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }
}
