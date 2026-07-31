import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';
import { PaymentMapper, PaymentModel } from '../../../parking/data/models/payment.model';
import {
  CreatePaymentParams,
  CorrectPaymentAmountParams,
  CorrectPaymentMethodParams,
  ListPaymentsParams,
  ListPaymentsResult,
  PaymentWithVehicle,
  VoidPaymentParams,
} from '../../domain/repositories/payment.repository';
import { PaymentDataSource } from './payment.datasource';

/** Fila de `payments` con el join embebido a `parking_sessions` (solo plate/entry_at, lo mínimo para el detalle de movimientos). */
interface PaymentWithSessionRow extends PaymentModel {
  parking_sessions: { vehicle_plate: string; entry_at: string } | null;
}

@Injectable()
export class PaymentRemoteDataSource extends PaymentDataSource {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async create(params: CreatePaymentParams): Promise<Either<Failure, PaymentEntity>> {
    try {
      const { data, error } = await this.supabase.client
        .from('payments')
        .insert({
          ...(params.sessionId ? { session_id: params.sessionId } : {}),
          cashier_shift_id: params.cashierShiftId,
          method: params.method,
          amount_cents: params.amountCents,
          status: 'completed',
          paid_at: new Date().toISOString(),
          ...(params.invoiceId ? { invoice_id: params.invoiceId } : {}),
          ...(params.gatewayRef ? { gateway_ref: params.gatewayRef } : {}),
        })
        .select()
        .single<PaymentModel>();

      if (error) return left(new ServerFailure(error.message));
      if (!data) return left(new ServerFailure('No se recibió datos del pago registrado'));
      return right(PaymentMapper.toEntity(data));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async list(params: ListPaymentsParams): Promise<Either<Failure, ListPaymentsResult>> {
    try {
      const offset = (params.page - 1) * params.pageSize;

      let query = this.supabase.client
        .from('payments')
        .select('*', { count: 'exact' })
        .eq('_deleted', false)
        .order('paid_at', { ascending: false });

      if (params.shiftId) {
        query = query.eq('cashier_shift_id', params.shiftId);
      }
      if (params.dateFrom) {
        query = query.gte('paid_at', params.dateFrom.toISOString());
      }
      if (params.dateTo) {
        query = query.lte('paid_at', params.dateTo.toISOString());
      }
      if (params.method) {
        query = query.eq('method', params.method);
      }
      if (params.status) {
        query = query.eq('status', params.status);
      }

      query = query.range(offset, offset + params.pageSize - 1);

      const { data, error, count } = await query.returns<PaymentModel[]>();

      if (error) return left(new ServerFailure(error.message));

      const entities = (data ?? []).map(PaymentMapper.toEntity);
      const total = count ?? 0;
      const totalCents = entities
        .filter((p) => p.status === 'completed')
        .reduce((acc, p) => acc + p.amountCents, 0);

      const pagination: PaginationMeta = {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.ceil(total / params.pageSize),
      };

      return right({ data: entities, pagination, totalCents });
    } catch {
      return left(new NetworkFailure());
    }
  }

  async listByShift(shiftId: string): Promise<Either<Failure, PaymentEntity[]>> {
    try {
      const { data, error } = await this.supabase.client
        .from('payments')
        .select()
        .eq('cashier_shift_id', shiftId)
        .eq('_deleted', false)
        .order('paid_at', { ascending: false })
        .returns<PaymentModel[]>();

      if (error) return left(new ServerFailure(error.message));
      return right((data ?? []).map(PaymentMapper.toEntity));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async listByShiftWithVehicle(shiftId: string): Promise<Either<Failure, PaymentWithVehicle[]>> {
    try {
      const { data, error } = await this.supabase.client
        .from('payments')
        .select(`
          *,
          parking_sessions:session_id ( vehicle_plate, entry_at )
        `)
        .eq('cashier_shift_id', shiftId)
        .eq('_deleted', false)
        .order('paid_at', { ascending: false })
        .returns<PaymentWithSessionRow[]>();

      if (error) return left(new ServerFailure(error.message));
      return right(
        (data ?? []).map((row) => ({
          payment: PaymentMapper.toEntity(row),
          plate: row.parking_sessions?.vehicle_plate ?? null,
          entryAt: row.parking_sessions?.entry_at ? new Date(row.parking_sessions.entry_at) : null,
        })),
      );
    } catch {
      return left(new NetworkFailure());
    }
  }

  async sumCashByShift(shiftId: string): Promise<Either<Failure, number>> {
    try {
      const { data, error } = await this.supabase.client
        .from('payments')
        .select('amount_cents')
        .eq('cashier_shift_id', shiftId)
        .eq('method', 'efectivo')
        .eq('status', 'completed')
        .eq('_deleted', false)
        .returns<{ amount_cents: number }[]>();

      if (error) return left(new ServerFailure(error.message));
      const total = (data ?? []).reduce((acc, r) => acc + r.amount_cents, 0);
      return right(total);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async correctMethod(params: CorrectPaymentMethodParams): Promise<Either<Failure, PaymentEntity>> {
    try {
      const { data, error } = await this.supabase.client.rpc('correct_shift_payment_method', {
        p_payment_id: params.paymentId,
        p_method: params.method,
      });

      if (error) return left(new ServerFailure(error.message));
      if (!data) return left(new ServerFailure('No se recibió el pago corregido'));
      return right(PaymentMapper.toEntity(data as PaymentModel));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async correctAmount(params: CorrectPaymentAmountParams): Promise<Either<Failure, PaymentEntity>> {
    try {
      const { data, error } = await this.supabase.client.rpc('correct_shift_payment_amount', {
        p_payment_id: params.paymentId,
        p_amount_cents: params.amountCents,
        p_reason: params.reason,
      });

      if (error) return left(new ServerFailure(error.message));
      if (!data) return left(new ServerFailure('No se recibió el pago corregido'));
      return right(PaymentMapper.toEntity(data as PaymentModel));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async voidPayment(params: VoidPaymentParams): Promise<Either<Failure, PaymentEntity>> {
    try {
      const { data, error } = await this.supabase.client.rpc('void_shift_payment', {
        p_payment_id: params.paymentId,
        p_reason: params.reason,
      });

      if (error) return left(new ServerFailure(error.message));
      const payment = (data as { payment?: PaymentModel } | null)?.payment;
      if (!payment) return left(new ServerFailure('No se recibió el pago anulado'));
      return right(PaymentMapper.toEntity(payment));
    } catch {
      return left(new NetworkFailure());
    }
  }
}
