import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, NotFoundFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import { VehicleMapper, VehicleModel } from '../../../parking/data/models/vehicle.model';
import { CreateVehicleParams, ListVehiclesParams, UpdateVehicleParams } from '../../domain/repositories/vehicle.repository';
import { VehicleDataSource } from './vehicle.datasource';

@Injectable()
export class VehicleRemoteDataSource extends VehicleDataSource {
  constructor(private readonly supabase: SupabaseService) { super(); }

  async list(params: ListVehiclesParams): Promise<Either<Failure, { data: VehicleEntity[]; pagination: PaginationMeta }>> {
    try {
      const page = params.pagination?.page ?? 1;
      const pageSize = params.pagination?.pageSize ?? 25;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = this.supabase.client.from('vehicles').select('*', { count: 'exact' });
      if (!params.includeDeleted) query = query.eq('_deleted', false);
      if (params.search) query = query.ilike('plate', `%${params.search.toUpperCase()}%`);
      if (params.vehicleType) query = query.eq('type', params.vehicleType);
      if (params.customerId) query = query.eq('owner_customer_id', params.customerId);

      const sortField = params.sort?.field ?? 'plate';
      const sortDir = params.sort?.direction ?? 'asc';
      query = query.order(sortField, { ascending: sortDir === 'asc' }).range(from, to);

      const { data, error, count } = await query;
      if (error) return left(new ServerFailure(error.message));

      const rows = (data ?? []) as VehicleModel[];
      const total = count ?? 0;
      return right({
        data: rows.map(VehicleMapper.toEntity),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async findById(id: string): Promise<Either<Failure, VehicleEntity>> {
    try {
      const { data, error } = await this.supabase.client
        .from('vehicles').select('*').eq('id', id).single();
      if (error) {
        return error.code === 'PGRST116'
          ? left(new NotFoundFailure('Vehículo no encontrado'))
          : left(new ServerFailure(error.message));
      }
      return right(VehicleMapper.toEntity(data as VehicleModel));
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async create(params: CreateVehicleParams): Promise<Either<Failure, VehicleEntity>> {
    try {
      const payload: Record<string, unknown> = {
        plate: params.plate,
        type: params.vehicleType,
      };
      if (params.color != null) payload['color'] = params.color;
      if (params.brand != null) payload['brand'] = params.brand;
      if (params.ownerCustomerId != null) payload['owner_customer_id'] = params.ownerCustomerId;

      const { data, error } = await this.supabase.client
        .from('vehicles').insert(payload).select().single();
      if (error) return left(new ServerFailure(error.message));
      return right(VehicleMapper.toEntity(data as VehicleModel));
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async update(params: UpdateVehicleParams): Promise<Either<Failure, VehicleEntity>> {
    try {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ('color' in params) patch['color'] = params.color ?? null;
      if ('brand' in params) patch['brand'] = params.brand ?? null;
      if ('ownerCustomerId' in params) patch['owner_customer_id'] = params.ownerCustomerId ?? null;

      const { data, error } = await this.supabase.client
        .from('vehicles').update(patch).eq('id', params.id).select().single();
      if (error) return left(new ServerFailure(error.message));
      return right(VehicleMapper.toEntity(data as VehicleModel));
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async deactivate(id: string): Promise<Either<Failure, void>> {
    try {
      const { error } = await this.supabase.client
        .from('vehicles').update({ _deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) return left(new ServerFailure(error.message));
      return right(undefined);
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async existsByPlate(plate: string): Promise<Either<Failure, boolean>> {
    try {
      const { count, error } = await this.supabase.client
        .from('vehicles').select('id', { count: 'exact', head: true })
        .eq('plate', plate).eq('_deleted', false);
      if (error) return left(new ServerFailure(error.message));
      return right((count ?? 0) > 0);
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async hasActiveSession(plate: string): Promise<Either<Failure, boolean>> {
    try {
      const { count, error } = await this.supabase.client
        .from('parking_sessions').select('id', { count: 'exact', head: true })
        .eq('vehicle_plate', plate).eq('status', 'active');
      if (error) return left(new ServerFailure(error.message));
      return right((count ?? 0) > 0);
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async hasActivePlan(plate: string): Promise<Either<Failure, boolean>> {
    try {
      const { count, error } = await this.supabase.client
        .from('monthly_plans').select('id', { count: 'exact', head: true })
        .eq('vehicle_plate', plate).in('status', ['active', 'expiring']).eq('_deleted', false);
      if (error) return left(new ServerFailure(error.message));
      return right((count ?? 0) > 0);
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }
}
