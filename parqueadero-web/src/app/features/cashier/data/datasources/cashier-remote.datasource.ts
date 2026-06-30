import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, NotFoundFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { CashierShiftEntity } from '../../domain/entities/cashier-shift.entity';
import {
  CloseShiftParams,
  ListShiftsParams,
  ListShiftsResult,
  OpenShiftParams,
  RegisterWithdrawalParams,
} from '../../domain/repositories/cashier.repository';
import { CashWithdrawalEntity } from '../../domain/entities/cash-withdrawal.entity';
import { CashierDataSource } from './cashier.datasource';
import { CashierShiftMapper, CashierShiftModel } from '../models/cashier-shift.model';

interface CashWithdrawalRow {
  id: string;
  shift_id: string;
  user_id: string;
  amount_cents: number;
  recipient: string;
  justification: string;
  movement_type?: 'in' | 'out';
  withdrawn_at: string;
  created_at: string;
  updated_at: string;
}

function mapWithdrawal(r: CashWithdrawalRow): CashWithdrawalEntity {
  return new CashWithdrawalEntity(
    r.id,
    new Date(r.created_at),
    new Date(r.updated_at),
    r.shift_id,
    r.user_id,
    r.amount_cents,
    r.recipient,
    r.justification,
    new Date(r.withdrawn_at),
    r.movement_type ?? 'out',
  );
}

interface ShiftWithOperatorRow extends CashierShiftModel {
  users: { nombre: string } | null;
}

@Injectable()
export class CashierRemoteDataSource extends CashierDataSource {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async findOpen(): Promise<Either<Failure, CashierShiftEntity | null>> {
    try {
      const { data, error } = await this.supabase.client
        .from('cashier_shifts')
        .select()
        .eq('status', 'open')
        .eq('_deleted', false)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle<CashierShiftModel>();

      if (error) return left(new ServerFailure(error.message));
      return right(data ? CashierShiftMapper.toEntity(data) : null);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async findOpenByUser(userId: string): Promise<Either<Failure, CashierShiftEntity | null>> {
    void userId;
    return this.findOpen();
  }

  async findById(shiftId: string): Promise<Either<Failure, CashierShiftEntity | null>> {
    try {
      const { data, error } = await this.supabase.client
        .from('cashier_shifts')
        .select()
        .eq('id', shiftId)
        .eq('_deleted', false)
        .maybeSingle<CashierShiftModel>();

      if (error) return left(new ServerFailure(error.message));
      return right(data ? CashierShiftMapper.toEntity(data) : null);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async create(params: OpenShiftParams): Promise<Either<Failure, CashierShiftEntity>> {
    try {
      const { data, error } = await this.supabase.client
        .from('cashier_shifts')
        .insert({
          user_id: params.userId,
          opening_balance_cents: params.openingBalanceCents,
          status: 'open',
          opened_at: new Date().toISOString(),
        })
        .select()
        .single<CashierShiftModel>();

      if (error) return left(new ServerFailure(error.message));
      if (!data) return left(new ServerFailure('No se recibió datos del turno creado'));
      return right(CashierShiftMapper.toEntity(data));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async listShifts(params: ListShiftsParams): Promise<Either<Failure, ListShiftsResult>> {
    try {
      const offset = (params.page - 1) * params.pageSize;
      let query = this.supabase.client
        .from('cashier_shifts')
        .select('*, users!inner(nombre)', { count: 'exact' })
        .eq('_deleted', false);

      if (params.userId) query = query.eq('user_id', params.userId);
      if (params.dateFrom) query = query.gte('opened_at', params.dateFrom.toISOString());
      if (params.dateTo) query = query.lte('opened_at', params.dateTo.toISOString());
      if (params.onlyWithDifference) {
        query = query.neq('difference_cents', 0);
      }

      const { data, count, error } = await query
        .order('opened_at', { ascending: false })
        .range(offset, offset + params.pageSize - 1)
        .returns<ShiftWithOperatorRow[]>();

      if (error) return left(new ServerFailure(error.message));

      const shifts = (data ?? []).map((row) => ({
        shift: CashierShiftMapper.toEntity(row),
        operatorName: row.users?.nombre ?? '—',
      }));

      const total = count ?? 0;
      return right({
        data: shifts,
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
        },
      });
    } catch {
      return left(new NetworkFailure());
    }
  }

  async registerWithdrawal(
    params: RegisterWithdrawalParams,
  ): Promise<Either<Failure, CashWithdrawalEntity>> {
    try {
      const { data, error } = await this.supabase.client
        .from('cash_withdrawals')
        .insert({
          shift_id: params.shiftId,
          user_id: params.userId,
          amount_cents: params.amountCents,
          recipient: params.recipient,
          justification: params.justification,
          movement_type: params.movementType ?? 'out',
          withdrawn_at: new Date().toISOString(),
        })
        .select()
        .single<CashWithdrawalRow>();

      if (error) return left(new ServerFailure(error.message));
      if (!data) return left(new ServerFailure('No se recibió datos del retiro'));
      return right(mapWithdrawal(data));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async listWithdrawalsByShift(shiftId: string): Promise<Either<Failure, CashWithdrawalEntity[]>> {
    try {
      const { data, error } = await this.supabase.client
        .from('cash_withdrawals')
        .select()
        .eq('shift_id', shiftId)
        .eq('_deleted', false)
        .order('withdrawn_at', { ascending: false })
        .returns<CashWithdrawalRow[]>();

      if (error) return left(new ServerFailure(error.message));
      return right((data ?? []).map(mapWithdrawal));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async close(params: CloseShiftParams): Promise<Either<Failure, CashierShiftEntity>> {
    try {
      const { data, error } = await this.supabase.client
        .from('cashier_shifts')
        .update({
          status: 'closed',
          closing_balance_cents: params.closingBalanceCents,
          expected_balance_cents: params.expectedBalanceCents,
          difference_cents: params.differenceCents,
          justification: params.justification,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.shiftId)
        .select()
        .single<CashierShiftModel>();

      if (error) return left(new ServerFailure(error.message));
      if (!data) return left(new NotFoundFailure('Turno no encontrado', 'cashier_shift'));
      return right(CashierShiftMapper.toEntity(data));
    } catch {
      return left(new NetworkFailure());
    }
  }
}
