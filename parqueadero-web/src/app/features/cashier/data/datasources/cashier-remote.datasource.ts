import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, NotFoundFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { CashierShiftEntity } from '../../domain/entities/cashier-shift.entity';
import { CloseShiftParams, OpenShiftParams } from '../../domain/repositories/cashier.repository';
import { CashierDataSource } from './cashier.datasource';
import { CashierShiftMapper, CashierShiftModel } from '../models/cashier-shift.model';

@Injectable()
export class CashierRemoteDataSource extends CashierDataSource {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async findOpenByUser(userId: string): Promise<Either<Failure, CashierShiftEntity | null>> {
    try {
      const { data, error } = await this.supabase.client
        .from('cashier_shifts')
        .select()
        .eq('user_id', userId)
        .eq('status', 'open')
        .eq('_deleted', false)
        .maybeSingle<CashierShiftModel>();

      if (error) return left(new ServerFailure(error.message));
      return right(data ? CashierShiftMapper.toEntity(data) : null);
    } catch {
      return left(new NetworkFailure());
    }
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
