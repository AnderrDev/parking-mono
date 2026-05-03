import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, ServerFailure } from '../../../../core/either/failures';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';
import { TariffModel, TariffMapper } from '../../../parking/data/models/tariff.model';
import { PaginatedResult } from '../../../../shared/models/pagination.model';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { TariffDataSource } from './tariff.datasource';
import { ListTariffsParams, CreateTariffParams, UpdateTariffParams } from '../../domain/repositories/tariff.repository';

@Injectable()
export class TariffRemoteDataSource extends TariffDataSource {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async list(params: ListTariffsParams): Promise<Either<Failure, PaginatedResult<TariffEntity>>> {
    try {
      const page = params.pagination?.page ?? 1;
      const pageSize = params.pagination?.pageSize ?? 25;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = this.supabase.client
        .from('tariffs')
        .select('*', { count: 'exact' })
        .eq('_deleted', false)
        .range(from, to);

      if (params.vehicleType) query = query.eq('vehicle_type', params.vehicleType);
      if (params.isActive !== null && params.isActive !== undefined) {
        query = query.eq('is_active', params.isActive);
      }

      const sortField = params.sort?.field ?? 'vehicle_type';
      const sortDir = params.sort?.direction ?? 'asc';
      query = query.order(sortField, { ascending: sortDir === 'asc' });
      if (sortField !== 'name') query = query.order('name', { ascending: true });

      const { data, error, count } = await query.returns<TariffModel[]>();
      if (error) return left(new ServerFailure(error.message));

      const total = count ?? 0;
      return right({
        data: (data ?? []).map(TariffMapper.toEntity),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch {
      return left(new NetworkFailure());
    }
  }

  async findById(id: string): Promise<Either<Failure, TariffEntity | null>> {
    try {
      const { data, error } = await this.supabase.client
        .from('tariffs')
        .select()
        .eq('id', id)
        .eq('_deleted', false)
        .maybeSingle<TariffModel>();
      if (error) return left(new ServerFailure(error.message));
      return right(data ? TariffMapper.toEntity(data) : null);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async create(params: CreateTariffParams): Promise<Either<Failure, TariffEntity>> {
    try {
      const { data, error } = await this.supabase.client
        .from('tariffs')
        .insert({
          name: params.name,
          vehicle_type: params.vehicleType,
          unit: params.unit,
          value_cents: params.valueCents,
          grace_minutes: params.graceMinutes,
          daily_cap_cents: params.dailyCapCents,
          schedule_json: params.scheduleJson ?? { todos: '00:00-23:59' },
          valid_from: params.validFrom?.toISOString().slice(0, 10) ?? null,
          valid_to: params.validTo?.toISOString().slice(0, 10) ?? null,
        })
        .select()
        .single<TariffModel>();
      if (error) return left(new ServerFailure(error.message));
      return right(TariffMapper.toEntity(data));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async update(id: string, params: UpdateTariffParams): Promise<Either<Failure, TariffEntity>> {
    try {
      const patch: Record<string, unknown> = {};
      if (params.name !== undefined) patch['name'] = params.name;
      if (params.valueCents !== undefined) patch['value_cents'] = params.valueCents;
      if (params.graceMinutes !== undefined) patch['grace_minutes'] = params.graceMinutes;
      if (params.dailyCapCents !== undefined) patch['daily_cap_cents'] = params.dailyCapCents;
      if (params.scheduleJson !== undefined) patch['schedule_json'] = params.scheduleJson;
      if (params.validFrom !== undefined) patch['valid_from'] = params.validFrom?.toISOString().slice(0, 10) ?? null;
      if (params.validTo !== undefined) patch['valid_to'] = params.validTo?.toISOString().slice(0, 10) ?? null;
      if (params.isActive !== undefined) patch['is_active'] = params.isActive;

      const { data, error } = await this.supabase.client
        .from('tariffs')
        .update(patch)
        .eq('id', id)
        .select()
        .single<TariffModel>();
      if (error) return left(new ServerFailure(error.message));
      return right(TariffMapper.toEntity(data));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async deactivate(id: string): Promise<Either<Failure, void>> {
    try {
      const { error } = await this.supabase.client
        .from('tariffs')
        .update({ is_active: false, _deleted: true })
        .eq('id', id);
      if (error) return left(new ServerFailure(error.message));
      return right(undefined);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async existsActive(name: string, vehicleType: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    try {
      let query = this.supabase.client
        .from('tariffs')
        .select('id', { count: 'exact', head: true })
        .eq('name', name)
        .eq('vehicle_type', vehicleType)
        .eq('is_active', true)
        .eq('_deleted', false);
      if (excludeId) query = query.neq('id', excludeId);
      const { count, error } = await query;
      if (error) return left(new ServerFailure(error.message));
      return right((count ?? 0) > 0);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async existsActiveSameCategory(vehicleType: VehicleType, isMonthly: boolean, excludeId?: string): Promise<Either<Failure, boolean>> {
    try {
      let query = this.supabase.client
        .from('tariffs')
        .select('id', { count: 'exact', head: true })
        .eq('vehicle_type', vehicleType)
        .eq('is_active', true)
        .eq('_deleted', false);
      if (isMonthly) {
        query = query.eq('unit', 'mensualidad');
      } else {
        query = query.neq('unit', 'mensualidad');
      }
      if (excludeId) query = query.neq('id', excludeId);

      const { count, error } = await query;
      if (error) return left(new ServerFailure(error.message));
      return right((count ?? 0) > 0);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async getActiveMonthlyTariff(vehicleType: VehicleType): Promise<Either<Failure, TariffEntity | null>> {
    try {
      const { data, error } = await this.supabase.client
        .from('tariffs')
        .select()
        .eq('vehicle_type', vehicleType)
        .eq('unit', 'mensualidad')
        .eq('is_active', true)
        .eq('_deleted', false)
        .limit(1)
        .maybeSingle<TariffModel>();

      if (error) return left(new ServerFailure(error.message));
      return right(data ? TariffMapper.toEntity(data) : null);
    } catch {
      return left(new NetworkFailure());
    }
  }
}
