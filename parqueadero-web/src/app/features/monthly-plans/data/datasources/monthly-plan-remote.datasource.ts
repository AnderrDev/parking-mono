import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import {
  BusinessRuleFailure, Failure, NetworkFailure, NotFoundFailure, ServerFailure, ValidationFailure,
} from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { MonthlyPlanMapper, MonthlyPlanModel } from '../../../parking/data/models/monthly-plan.model';
import {
  CancelPlanOutcome, CreateMonthlyPlanParams, ListMonthlyPlansParams, UpdateMonthlyPlanParams,
} from '../../domain/repositories/monthly-plan.repository';
import { MonthlyPlanDataSource } from './monthly-plan.datasource';
import {
  formatIsoDateOnly, parseIsoDateOnly, todayDateOnlyBogota, todayIsoBogota,
} from '../../../../shared/utils/date.utils';

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

  /**
   * Delega en la RPC `create_monthly_plan_with_payment` (migration 00040):
   * plan e ingreso se insertan en la misma transacción del servidor, y el
   * solapamiento lo decide la constraint `monthly_plans_no_overlap`, no una
   * consulta previa del cliente que otra venta simultánea puede invalidar.
   */
  async createWithPayment(
    params: CreateMonthlyPlanParams,
    shiftId: string,
  ): Promise<Either<Failure, MonthlyPlanEntity>> {
    try {
      const { data, error } = await this.supabase.client.rpc('create_monthly_plan_with_payment', {
        p_customer_id: params.customerId,
        p_vehicle_plate: params.vehiclePlate,
        p_plan_type: params.planType,
        p_start_date: formatIsoDateOnly(params.startDate),
        p_end_date: formatIsoDateOnly(params.endDate),
        p_amount_cents: params.amountCents,
        p_shift_id: shiftId,
        p_payment_method: params.paymentMethod,
        p_client_op_id_payment: crypto.randomUUID(),
      });

      if (error) return left(this.mapRpcError(error, params.vehiclePlate));

      const plan = (data as { plan: MonthlyPlanModel } | null)?.plan;
      if (!plan) return left(new ServerFailure('La venta no devolvió el plan creado'));
      return right(MonthlyPlanMapper.toEntity(plan));
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  /**
   * Traduce los errores de la RPC a Failures de dominio. Los `RAISE
   * EXCEPTION` de la función llegan como texto dentro de `error.message`.
   */
  private mapRpcError(error: { message: string; code?: string }, plate: string): Failure {
    const msg = error.message ?? '';
    if (msg.includes('plan_overlap')) {
      return new BusinessRuleFailure(
        `La placa ${plate} ya tiene una mensualidad vigente que se solapa con esas fechas`,
      );
    }
    if (msg.includes('shift_not_open')) {
      return new BusinessRuleFailure('La caja se cerró. Abre un turno para registrar la venta.');
    }
    if (msg.includes('plan_already_expired')) {
      return new ValidationFailure('La fecha de fin ya pasó');
    }
    if (msg.includes('invalid_date_range')) {
      return new ValidationFailure('La fecha de fin debe ser posterior a la de inicio');
    }
    if (msg.includes('invalid_plan_type')) return new ValidationFailure('Tipo de plan inválido');
    if (msg.includes('invalid_amount')) return new ValidationFailure('El valor del plan debe ser mayor que 0');
    // 42501 = RLS. Sin este caso el operador solo veía "Error del servidor".
    if (error.code === '42501' || msg.includes('row-level security')) {
      return new BusinessRuleFailure('Tu usuario no tiene permiso para vender mensualidades');
    }
    return new ServerFailure(msg);
  }

  async update(params: UpdateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> {
    try {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (params.endDate !== undefined) {
        patch['end_date'] = formatIsoDateOnly(params.endDate);
        patch['status'] = this.statusForEndDate(params.endDate);
      }
      if (params.amountCents !== undefined) patch['amount_cents'] = params.amountCents;

      const { data, error } = await this.supabase.client
        .from('monthly_plans').update(patch).eq('id', params.id).select().single();
      if (error) {
        // Extender la vigencia puede chocar contra `monthly_plans_no_overlap`
        // si la placa ya tiene otro plan en esas fechas (código 23P01).
        if (error.code === '23P01' || error.message?.includes('monthly_plans_no_overlap')) {
          return left(new BusinessRuleFailure(
            'Esa vigencia se solapa con otra mensualidad de la misma placa',
          ));
        }
        return left(new ServerFailure(error.message));
      }
      return right(MonthlyPlanMapper.toEntity(data as MonthlyPlanModel));
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  /**
   * Cancela vía RPC `cancel_monthly_plan` (00044), que además anula el
   * ingreso de la venta si el turno donde entró sigue abierto. Un UPDATE
   * directo dejaba el plan cancelado y la plata contando en la caja.
   */
  async cancel(id: string): Promise<Either<Failure, CancelPlanOutcome>> {
    try {
      const { data, error } = await this.supabase.client
        .rpc('cancel_monthly_plan', { p_plan_id: id, p_reason: 'Plan mensual cancelado desde la lista' });
      if (error) {
        if (error.message?.includes('plan_not_cancellable')) {
          return left(new BusinessRuleFailure('El plan ya está cancelado o vencido'));
        }
        if (error.message?.includes('plan_not_found')) {
          return left(new NotFoundFailure('Plan no encontrado'));
        }
        if (error.code === '42501' || error.message?.includes('user_not_allowed')) {
          return left(new BusinessRuleFailure('Tu usuario no tiene permiso para cancelar planes'));
        }
        return left(new ServerFailure(error.message));
      }
      const result = data as { payment_refunded?: boolean; payment_kept_closed_shift?: boolean } | null;
      return right({
        paymentRefunded: result?.payment_refunded ?? false,
        paymentKeptClosedShift: result?.payment_kept_closed_shift ?? false,
      });
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  /**
   * `expiring` si vence dentro del umbral, `active` en caso contrario.
   * Se compara por día calendario de Colombia (ver `parseIsoDateOnly`).
   */
  private statusForEndDate(endDate: Date): 'active' | 'expiring' {
    const today = todayDateOnlyBogota();
    const end = parseIsoDateOnly(formatIsoDateOnly(endDate));
    const daysLeft = Math.round((end.getTime() - today.getTime()) / 86_400_000);
    return daysLeft <= EXPIRING_THRESHOLD_DAYS ? 'expiring' : 'active';
  }

  async hasActivePlanForPlate(
    plate: string,
    range?: { start: Date; end: Date },
    excludeId?: string,
  ): Promise<Either<Failure, boolean>> {
    try {
      let query = this.supabase.client
        .from('monthly_plans').select('id', { count: 'exact', head: true })
        .eq('vehicle_plate', plate).in('status', ['active', 'expiring'])
        .eq('_deleted', false);

      if (range) {
        // Solapamiento de rangos con ambos extremos inclusivos, igual que
        // `daterange(start_date, end_date, '[]')` de la constraint: chocan si
        // cada uno empieza antes de que el otro termine.
        query = query
          .lte('start_date', formatIsoDateOnly(range.end))
          .gte('end_date', formatIsoDateOnly(range.start));
      } else {
        // Sin el filtro de fecha, un plan vencido hace meses (que nadie marca
        // como `expired`) bloqueaba para siempre la renovación de esa placa.
        query = query.gte('end_date', todayIsoBogota());
      }
      if (excludeId) query = query.neq('id', excludeId);
      const { count, error } = await query;
      if (error) return left(new ServerFailure(error.message));
      return right((count ?? 0) > 0);
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }
}
