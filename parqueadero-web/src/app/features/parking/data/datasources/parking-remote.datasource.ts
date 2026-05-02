import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, NotFoundFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { PaginationMeta as Pagination } from '../../../../shared/models/pagination.model';
import { ParkingSessionEntity, VehicleType } from '../../domain/entities/parking-session.entity';
import { VehicleEntity } from '../../domain/entities/vehicle.entity';
import { MonthlyPlanEntity } from '../../domain/entities/monthly-plan.entity';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import {
  RegisterEntryParams,
  RegisterExitParams,
  RegisterExitResult,
  ActiveSessionsFilter,
  ActiveSessionsSort,
  ListSessionsParams,
  ListSessionsResult,
  CancelSessionParams,
  OpenShiftSummary,
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
      // Persistimos color/brand en `vehicles` (no en parking_sessions). Insertamos el
      // vehículo si no existe; si ya existe, no sobrescribimos sus datos previos.
      const { error: vehicleError } = await this.supabase.client
        .from('vehicles')
        .upsert(
          {
            plate: params.plate,
            type: params.vehicleType,
            color: params.color,
            brand: params.brand,
          },
          { onConflict: 'plate', ignoreDuplicates: true },
        );

      if (vehicleError) return left(new ServerFailure(vehicleError.message));

      // Nota: parking_sessions NO tiene cashier_shift_id. El turno se registra en
      // `payments` al momento del cobro (una sesión puede abrirse en un turno y
      // cerrarse en otro). El cashierShiftId del usecase se usa sólo en exit.
      const { data, error } = await this.supabase.client
        .from('parking_sessions')
        .insert({
          vehicle_plate: params.plate,
          vehicle_type: params.vehicleType,
          entry_user_id: params.userId,
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

  async searchVehicle(query: string): Promise<Either<Failure, VehicleSearchData>> {
    try {
      // Búsqueda parcial: aceptamos fragmentos (ej. "TPP" → "TPP06G"). Tomamos el
      // match más recientemente actualizado como vehículo principal y luego cargamos
      // sus sesiones/plan por placa exacta.
      const pattern = `%${query}%`;
      const vehicleRes = await this.supabase.client
        .from('vehicles')
        .select()
        .ilike('plate', pattern)
        .eq('_deleted', false)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle<VehicleModel>();

      if (vehicleRes.error) return left(new ServerFailure(vehicleRes.error.message));

      const vehicle = vehicleRes.data ? VehicleMapper.toEntity(vehicleRes.data) : null;

      // Para sesiones y plan: si encontramos vehículo, usamos su placa exacta. Si no,
      // intentamos match parcial en `vehicle_plate` (puede haber sesiones registradas
      // sin row en `vehicles`).
      let activeQ = this.supabase.client
        .from('parking_sessions')
        .select()
        .eq('status', 'active')
        .eq('_deleted', false);
      let historyQ = this.supabase.client
        .from('parking_sessions')
        .select()
        .eq('status', 'completed')
        .eq('_deleted', false)
        .order('exit_at', { ascending: false })
        .limit(5);
      let planQ = this.supabase.client
        .from('monthly_plans')
        .select()
        .in('status', ['active', 'expiring'])
        .eq('_deleted', false)
        .order('end_date', { ascending: false })
        .limit(1);

      if (vehicle) {
        activeQ = activeQ.eq('vehicle_plate', vehicle.plate);
        historyQ = historyQ.eq('vehicle_plate', vehicle.plate);
        planQ = planQ.eq('vehicle_plate', vehicle.plate);
      } else {
        activeQ = activeQ.ilike('vehicle_plate', pattern);
        historyQ = historyQ.ilike('vehicle_plate', pattern);
        planQ = planQ.ilike('vehicle_plate', pattern);
      }

      const [activeRes, historyRes, planRes] = await Promise.all([
        activeQ.returns<ParkingSessionModel[]>(),
        historyQ.returns<ParkingSessionModel[]>(),
        planQ.maybeSingle<MonthlyPlanModel>(),
      ]);

      if (activeRes.error) return left(new ServerFailure(activeRes.error.message));
      if (historyRes.error) return left(new ServerFailure(historyRes.error.message));
      if (planRes.error) return left(new ServerFailure(planRes.error.message));

      return right({
        vehicle,
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

  async getOpenShiftSummary(
    userId: string,
  ): Promise<Either<Failure, OpenShiftSummary | null>> {
    try {
      const { data, error } = await this.supabase.client
        .from('cashier_shifts')
        .select('id, opened_at, opening_balance_cents')
        .eq('user_id', userId)
        .eq('status', 'open')
        .eq('_deleted', false)
        .maybeSingle<{
          id: string;
          opened_at: string;
          opening_balance_cents: number;
        }>();

      if (error) return left(new ServerFailure(error.message));
      if (!data) return right(null);
      return right({
        shiftId: data.id,
        openedAt: new Date(data.opened_at),
        openingBalanceCents: data.opening_balance_cents,
      });
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
      // Todos los métodos se insertan como 'completed': no hay flujo asíncrono
      // de confirmación. El cajero solo registra después de recibir el dinero
      // (efectivo en mano, tarjeta deslizada, transferencia validada). Si en
      // el futuro hay integración con pasarela que requiera confirmar webhook,
      // ahí sí tiene sentido 'pending'. Mantener consistencia con
      // payment-remote.datasource.ts:create().
      const { data: paymentData, error: paymentError } = await this.supabase.client
        .from('payments')
        .insert({
          session_id: params.sessionId,
          cashier_shift_id: params.cashierShiftId,
          method: params.paymentMethod,
          amount_cents: params.amountCents,
          status: 'completed',
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

  async listSessions(params: ListSessionsParams): Promise<Either<Failure, ListSessionsResult>> {
    try {
      const offset = (params.page - 1) * params.pageSize;
      let query = this.supabase.client
        .from('parking_sessions')
        .select('*', { count: 'exact' })
        .eq('_deleted', false);

      if (params.dateFrom) query = query.gte('entry_at', params.dateFrom.toISOString());
      if (params.dateTo) query = query.lte('entry_at', params.dateTo.toISOString());
      if (params.vehicleType) query = query.eq('vehicle_type', params.vehicleType);
      if (params.plate) query = query.ilike('vehicle_plate', `%${params.plate}%`);
      if (params.status && params.status !== 'all') {
        query = query.eq('status', params.status);
      }

      const { data, count, error } = await query
        .order('entry_at', { ascending: false })
        .range(offset, offset + params.pageSize - 1)
        .returns<ParkingSessionModel[]>();

      if (error) return left(new ServerFailure(error.message));

      const total = count ?? 0;
      return right({
        data: (data ?? []).map((m) => ParkingSessionMapper.toEntity(m)),
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
        } satisfies Pagination,
      });
    } catch {
      return left(new NetworkFailure());
    }
  }

  async cancelSession(params: CancelSessionParams): Promise<Either<Failure, ParkingSessionEntity>> {
    try {
      // Marcamos la sesión como cancelled. Si tiene pago asociado, también lo
      // marcamos como refunded para que no afecte el cuadre del turno.
      const { data: sessionRow, error: sessErr } = await this.supabase.client
        .from('parking_sessions')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.sessionId)
        .select()
        .single<ParkingSessionModel>();

      if (sessErr) return left(new ServerFailure(sessErr.message));
      if (!sessionRow) return left(new NotFoundFailure('Sesión no encontrada', 'parking_session'));

      // Refund del pago si existe (idempotente: si ya está refunded, ignora).
      await this.supabase.client
        .from('payments')
        .update({ status: 'refunded', updated_at: new Date().toISOString() })
        .eq('session_id', params.sessionId)
        .eq('status', 'completed');

      // Insertar entrada de auditoría con el motivo (apoyo a triggers automáticos).
      await this.supabase.client.from('audit_log').insert({
        user_id: params.userId,
        action: 'UPDATE',
        entity_type: 'parking_sessions',
        entity_id: params.sessionId,
        after_json: { status: 'cancelled', reason: params.reason },
      });

      return right(ParkingSessionMapper.toEntity(sessionRow));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async searchPlateSuggestions(
    query: string,
    limit: number,
  ): Promise<Either<Failure, VehicleEntity[]>> {
    try {
      const { data, error } = await this.supabase.client
        .from('vehicles')
        .select()
        .ilike('plate', `%${query}%`)
        .eq('_deleted', false)
        .order('updated_at', { ascending: false })
        .limit(limit)
        .returns<VehicleModel[]>();

      if (error) return left(new ServerFailure(error.message));
      return right((data ?? []).map(VehicleMapper.toEntity));
    } catch {
      return left(new NetworkFailure());
    }
  }
}
