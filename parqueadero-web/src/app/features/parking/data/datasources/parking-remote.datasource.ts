import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { PaginationMeta as Pagination } from '../../../../shared/models/pagination.model';
import { ParkingSessionEntity } from '../../domain/entities/parking-session.entity';
import { MonthlyPlanEntity } from '../../domain/entities/monthly-plan.entity';
import {
  RegisterEntryParams,
  ActiveSessionsFilter,
  ActiveSessionsSort,
} from '../../domain/repositories/parking.repository';
import { ParkingSessionMapper, ParkingSessionModel } from '../models/parking-session.model';
import { VehicleMapper, VehicleModel } from '../models/vehicle.model';
import { MonthlyPlanMapper, MonthlyPlanModel } from '../models/monthly-plan.model';
import {
  ParkingDataSource,
  ActiveSessionsPage,
  VehicleSearchData,
} from './parking.datasource';

@Injectable()
export class ParkingRemoteDataSource extends ParkingDataSource {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async insertSession(params: RegisterEntryParams): Promise<Either<Failure, ParkingSessionEntity>> {
    try {
      const { data, error } = await this.supabase.client
        .from('parking_sessions')
        .insert({
          vehicle_plate: params.plate,
          vehicle_type: params.vehicleType,
          color: params.color,
          brand: params.brand,
          entry_user_id: params.userId,
          cashier_shift_id: params.cashierShiftId,
          monthly_plan_id: params.monthlyPlanId,
          entry_at: new Date().toISOString(),
          status: 'active',
          _sync_status: 'synced',
        })
        .select()
        .single<ParkingSessionModel>();

      if (error) return left(new ServerFailure(error.message));
      if (!data) return left(new ServerFailure('No se recibió datos de la sesión creada'));

      return right(ParkingSessionMapper.toEntity(data));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async getActiveSessionByPlate(
    plate: string,
  ): Promise<Either<Failure, ParkingSessionEntity | null>> {
    try {
      const { data, error } = await this.supabase.client
        .from('parking_sessions')
        .select()
        .eq('vehicle_plate', plate)
        .eq('status', 'active')
        .eq('_deleted', false)
        .maybeSingle<ParkingSessionModel>();

      if (error) return left(new ServerFailure(error.message));
      return right(data ? ParkingSessionMapper.toEntity(data) : null);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async getActiveSessions(
    filter: ActiveSessionsFilter,
    pagination: { page: number; pageSize: number },
    sort: ActiveSessionsSort,
  ): Promise<Either<Failure, ActiveSessionsPage>> {
    try {
      const offset = (pagination.page - 1) * pagination.pageSize;

      let query = this.supabase.client
        .from('parking_sessions')
        .select('*', { count: 'exact' })
        .eq('status', 'active')
        .eq('_deleted', false);

      if (filter.vehicleType) {
        query = query.eq('vehicle_type', filter.vehicleType);
      }

      const sortColumn = sort.field === 'plate' ? 'vehicle_plate' : 'entry_at';
      query = query.order(sortColumn, { ascending: sort.direction === 'asc' });
      query = query.range(offset, offset + pagination.pageSize - 1);

      const { data, error, count } = await query.returns<ParkingSessionModel[]>();

      if (error) return left(new ServerFailure(error.message));

      const total = count ?? 0;
      const result: ActiveSessionsPage = {
        data: (data ?? []).map(ParkingSessionMapper.toEntity),
        pagination: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          total,
          totalPages: Math.ceil(total / pagination.pageSize),
        } satisfies Pagination,
      };

      return right(result);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async searchVehicle(plate: string): Promise<Either<Failure, VehicleSearchData>> {
    try {
      const [vehicleRes, activeRes, historyRes, planRes] = await Promise.all([
        this.supabase.client
          .from('vehicles')
          .select()
          .eq('plate', plate)
          .eq('_deleted', false)
          .maybeSingle<VehicleModel>(),
        this.supabase.client
          .from('parking_sessions')
          .select()
          .eq('vehicle_plate', plate)
          .eq('status', 'active')
          .eq('_deleted', false)
          .returns<ParkingSessionModel[]>(),
        this.supabase.client
          .from('parking_sessions')
          .select()
          .eq('vehicle_plate', plate)
          .eq('status', 'completed')
          .eq('_deleted', false)
          .order('exit_at', { ascending: false })
          .limit(5)
          .returns<ParkingSessionModel[]>(),
        this.supabase.client
          .from('monthly_plans')
          .select()
          .eq('vehicle_plate', plate)
          .in('status', ['active', 'expiring'])
          .eq('_deleted', false)
          .maybeSingle<MonthlyPlanModel>(),
      ]);

      if (vehicleRes.error) return left(new ServerFailure(vehicleRes.error.message));
      if (activeRes.error) return left(new ServerFailure(activeRes.error.message));
      if (historyRes.error) return left(new ServerFailure(historyRes.error.message));
      if (planRes.error) return left(new ServerFailure(planRes.error.message));

      return right({
        vehicle: vehicleRes.data ? VehicleMapper.toEntity(vehicleRes.data) : null,
        activeSessions: (activeRes.data ?? []).map(ParkingSessionMapper.toEntity),
        lastSessions: (historyRes.data ?? []).map(ParkingSessionMapper.toEntity),
        monthlyPlan: planRes.data ? MonthlyPlanMapper.toEntity(planRes.data) : null,
      });
    } catch {
      return left(new NetworkFailure());
    }
  }

  async getOpenCashierShiftId(userId: string): Promise<Either<Failure, string | null>> {
    try {
      const { data, error } = await this.supabase.client
        .from('cashier_shifts')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'open')
        .eq('_deleted', false)
        .maybeSingle<{ id: string }>();

      if (error) return left(new ServerFailure(error.message));
      return right(data?.id ?? null);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async getActivePlanByPlate(plate: string): Promise<Either<Failure, MonthlyPlanEntity | null>> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await this.supabase.client
        .from('monthly_plans')
        .select()
        .eq('vehicle_plate', plate)
        .in('status', ['active', 'expiring'])
        .gte('end_date', today)
        .eq('_deleted', false)
        .maybeSingle<MonthlyPlanModel>();

      if (error) return left(new ServerFailure(error.message));
      return right(data ? MonthlyPlanMapper.toEntity(data) : null);
    } catch {
      return left(new NetworkFailure());
    }
  }
}
