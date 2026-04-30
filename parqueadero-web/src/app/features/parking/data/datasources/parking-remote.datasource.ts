import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, NotFoundFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { PaginationMeta as Pagination } from '../../../../shared/models/pagination.model';
import { ParkingSessionEntity, VehicleType } from '../../domain/entities/parking-session.entity';
import { MonthlyPlanEntity } from '../../domain/entities/monthly-plan.entity';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import { FREE_PAYMENT_METHODS } from '../../domain/entities/payment.entity';
import {
  RegisterEntryParams,
  RegisterExitParams,
  RegisterExitResult,
  ActiveSessionsFilter,
  ActiveSessionsSort,
} from '../../domain/repositories/parking.repository';
import { ParkingSessionMapper, ParkingSessionModel } from '../models/parking-session.model';
import { VehicleMapper, VehicleModel } from '../models/vehicle.model';
import { MonthlyPlanMapper, MonthlyPlanModel } from '../models/monthly-plan.model';
import { TariffMapper, TariffModel } from '../models/tariff.model';
import { PaymentMapper, PaymentModel } from '../models/payment.model';
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

  async closeSession(params: RegisterExitParams): Promise<Either<Failure, RegisterExitResult>> {
    try {
      // 1. Update session to completed
      const { data: sessionData, error: sessionError } = await this.supabase.client
        .from('parking_sessions')
        .update({
          exit_at: params.exitAt.toISOString(),
          status: 'completed',
          amount_due_cents: params.amountCents,
          exit_user_id: params.userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.sessionId)
        .select()
        .single<ParkingSessionModel>();

      if (sessionError) return left(new ServerFailure(sessionError.message));
      if (!sessionData) return left(new ServerFailure('No se recibió datos de la sesión actualizada'));

      // 2. Insert payment record
      const paymentStatus = FREE_PAYMENT_METHODS.includes(params.paymentMethod) ? 'completed' : 'pending';
      const { data: paymentData, error: paymentError } = await this.supabase.client
        .from('payments')
        .insert({
          session_id: params.sessionId,
          cashier_shift_id: params.cashierShiftId,
          method: params.paymentMethod,
          amount_cents: params.amountCents,
          status: paymentStatus,
          paid_at: new Date().toISOString(),
          justification: params.justification,
          invoice_id: null,
        })
        .select()
        .single<PaymentModel>();

      if (paymentError) return left(new ServerFailure(paymentError.message));
      if (!paymentData) return left(new ServerFailure('No se recibió datos del pago registrado'));

      return right({
        session: ParkingSessionMapper.toEntity(sessionData),
        payment: PaymentMapper.toEntity(paymentData),
      });
    } catch {
      return left(new NetworkFailure());
    }
  }

  async getActiveTariff(vehicleType: VehicleType): Promise<Either<Failure, TariffEntity>> {
    try {
      const { data, error } = await this.supabase.client
        .from('tariffs')
        .select()
        .eq('vehicle_type', vehicleType)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle<TariffModel>();

      if (error) return left(new ServerFailure(error.message));
      if (!data) {
        return left(new NotFoundFailure(`No hay tarifa activa para tipo de vehículo: ${vehicleType}`, 'tariff'));
      }

      return right(TariffMapper.toEntity(data));
    } catch {
      return left(new NetworkFailure());
    }
  }
}
