import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, ServerFailure } from '../../../../core/either/failures';
import { PowerSyncService } from '../../../../core/services/powersync.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';
import { PaymentMapper, PaymentModel } from '../../../parking/data/models/payment.model';
import { CreatePaymentParams, ListPaymentsParams, ListPaymentsResult } from '../../domain/repositories/payment.repository';
import { PaymentDataSource } from './payment.datasource';

@Injectable()
export class PaymentLocalDataSource extends PaymentDataSource {
  private get db() { return this.ps.db; }

  constructor(private readonly ps: PowerSyncService) { super(); }

  async create(params: CreatePaymentParams): Promise<Either<Failure, PaymentEntity>> {
    try {
      const id = crypto.randomUUID();
      const ts = new Date().toISOString();
      await this.db.execute(
        `INSERT INTO payments
          (id, session_id, cashier_shift_id, method, amount_cents, status, paid_at,
           _sync_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'completed', ?, 'pending', ?, ?)`,
        [
          id,
          params.sessionId ?? null,
          params.cashierShiftId,
          params.method,
          params.amountCents,
          ts, ts, ts,
        ],
      );
      const rows = await this.db.getAll<PaymentModel>(`SELECT * FROM payments WHERE id = ?`, [id]);
      if (!rows[0]) return left(new ServerFailure('Pago no encontrado tras insertar'));
      return right(PaymentMapper.toEntity(rows[0]));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async list(params: ListPaymentsParams): Promise<Either<Failure, ListPaymentsResult>> {
    try {
      const conditions: string[] = ['(_deleted IS NULL OR _deleted = 0)'];
      const bindings: unknown[] = [];

      if (params.shiftId) { conditions.push('cashier_shift_id = ?'); bindings.push(params.shiftId); }
      if (params.method) { conditions.push('method = ?'); bindings.push(params.method); }
      if (params.status) { conditions.push('status = ?'); bindings.push(params.status); }
      if (params.dateFrom) { conditions.push('paid_at >= ?'); bindings.push(params.dateFrom.toISOString()); }
      if (params.dateTo) { conditions.push('paid_at <= ?'); bindings.push(params.dateTo.toISOString()); }

      const where = conditions.join(' AND ');
      const offset = (params.page - 1) * params.pageSize;

      const countRows = await this.db.getAll<{ total: number; total_cents: number }>(
        `SELECT COUNT(*) as total, COALESCE(SUM(amount_cents), 0) as total_cents FROM payments WHERE ${where}`,
        bindings,
      );
      const total = countRows[0]?.total ?? 0;
      const totalCents = countRows[0]?.total_cents ?? 0;

      const rows = await this.db.getAll<PaymentModel>(
        `SELECT * FROM payments WHERE ${where} ORDER BY paid_at DESC LIMIT ? OFFSET ?`,
        [...bindings, params.pageSize, offset],
      );

      const pagination: PaginationMeta = {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.ceil(total / params.pageSize) || 1,
      };

      return right({ data: rows.map(PaymentMapper.toEntity), pagination, totalCents });
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async listByShift(shiftId: string): Promise<Either<Failure, PaymentEntity[]>> {
    try {
      const rows = await this.db.getAll<PaymentModel>(
        `SELECT * FROM payments
         WHERE cashier_shift_id = ? AND (_deleted IS NULL OR _deleted = 0)
         ORDER BY paid_at ASC`,
        [shiftId],
      );
      return right(rows.map(PaymentMapper.toEntity));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async sumCashByShift(shiftId: string): Promise<Either<Failure, number>> {
    try {
      const rows = await this.db.getAll<{ total: number }>(
        `SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments
         WHERE cashier_shift_id = ? AND method = 'efectivo' AND status = 'completed'
         AND (_deleted IS NULL OR _deleted = 0)`,
        [shiftId],
      );
      return right(rows[0]?.total ?? 0);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }
}
