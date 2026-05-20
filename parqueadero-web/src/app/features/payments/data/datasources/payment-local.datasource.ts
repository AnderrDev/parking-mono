import { Injectable, inject } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, ServerFailure } from '../../../../core/either/failures';
import {
  LocalDbService,
  PaymentModel as LocalPaymentModel,
} from '../../../../core/services/local-db.service';
import { SyncOrchestrator } from '../../../../core/services/sync-orchestrator.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';
import {
  PaymentMapper,
  PaymentModel,
} from '../../../parking/data/models/payment.model';
import {
  CreatePaymentParams,
  ListPaymentsParams,
  ListPaymentsResult,
} from '../../domain/repositories/payment.repository';
import { PaymentDataSource } from './payment.datasource';

// ──────────────────────────────────────────────────────────────────────────────
// PaymentLocalDataSource — Sprint 2 (Fase 8).
//
// Persiste pagos en el mirror Dexie y encola insert al server vía outbox.
// Las lecturas (list / listByShift / sumCashByShift) consultan el mirror.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class PaymentLocalDataSource extends PaymentDataSource {
  private readonly localDb = inject(LocalDbService);
  private readonly orchestrator = inject(SyncOrchestrator);

  async create(
    params: CreatePaymentParams,
  ): Promise<Either<Failure, PaymentEntity>> {
    try {
      const now = new Date();
      const id = crypto.randomUUID();
      const opId = crypto.randomUUID();
      const row: PaymentModel & {
        _deleted: boolean;
        client_op_id: string;
      } = {
        id,
        session_id: params.sessionId,
        cashier_shift_id: params.cashierShiftId,
        method: params.method,
        amount_cents: params.amountCents,
        status: 'completed',
        paid_at: now.toISOString(),
        justification: null,
        invoice_id: params.invoiceId,
        gateway_ref: params.gatewayRef,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        _deleted: false,
        client_op_id: opId,
      };

      const localRow: LocalPaymentModel = {
        id: row.id,
        cashier_shift_id: row.cashier_shift_id,
        paid_at: row.paid_at,
        status: row.status,
        client_op_id: opId,
        _sync_status: 'pending',
        session_id: row.session_id,
        method: row.method,
        amount_cents: row.amount_cents,
        justification: row.justification,
        invoice_id: row.invoice_id,
        gateway_ref: row.gateway_ref,
        created_at: row.created_at,
        updated_at: row.updated_at,
        _deleted: false,
      };
      await this.localDb.getDB().payments.put(localRow);

      // Payload del INSERT remoto: replica la forma del remote DS (omite
      // session_id si es null, mismas reglas para invoice_id / gateway_ref).
      const payload: Record<string, unknown> = {
        id,
        cashier_shift_id: params.cashierShiftId,
        method: params.method,
        amount_cents: params.amountCents,
        status: 'completed',
        paid_at: row.paid_at,
      };
      if (params.sessionId) payload['session_id'] = params.sessionId;
      if (params.invoiceId) payload['invoice_id'] = params.invoiceId;
      if (params.gatewayRef) payload['gateway_ref'] = params.gatewayRef;

      await this.orchestrator.enqueue({
        opId,
        table: 'payments',
        operation: 'insert',
        payload,
        rowId: id,
        enqueuedAt: now,
        attempts: 0,
        status: 'pending',
      });

      return right(PaymentMapper.toEntity(row as unknown as PaymentModel));
    } catch (e) {
      return left(new ServerFailure(`Persistencia local falló: ${String(e)}`));
    }
  }

  async list(
    params: ListPaymentsParams,
  ): Promise<Either<Failure, ListPaymentsResult>> {
    try {
      let rows = await this.localDb.getDB().payments.toArray();
      rows = rows.filter((p) => !(p as { _deleted?: boolean })._deleted);
      if (params.shiftId) {
        rows = rows.filter((p) => p.cashier_shift_id === params.shiftId);
      }
      if (params.dateFrom) {
        const f = params.dateFrom.getTime();
        rows = rows.filter((p) => new Date(p.paid_at).getTime() >= f);
      }
      if (params.dateTo) {
        const t = params.dateTo.getTime();
        rows = rows.filter((p) => new Date(p.paid_at).getTime() <= t);
      }
      if (params.method) {
        rows = rows.filter(
          (p) => (p as { method?: string }).method === params.method,
        );
      }
      if (params.status) {
        rows = rows.filter((p) => p.status === params.status);
      }
      rows.sort((a, b) => (b.paid_at ?? '').localeCompare(a.paid_at ?? ''));

      const total = rows.length;
      const offset = (params.page - 1) * params.pageSize;
      const page = rows.slice(offset, offset + params.pageSize);
      const entities = page.map((r) =>
        PaymentMapper.toEntity(r as unknown as PaymentModel),
      );
      const totalCents = entities
        .filter((p) => p.status === 'completed')
        .reduce((acc, p) => acc + p.amountCents, 0);

      const pagination: PaginationMeta = {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
      };
      return right({ data: entities, pagination, totalCents });
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  async listByShift(
    shiftId: string,
  ): Promise<Either<Failure, PaymentEntity[]>> {
    try {
      const rows = await this.localDb
        .getDB()
        .payments.where('cashier_shift_id')
        .equals(shiftId)
        .toArray();
      const filtered = rows
        .filter((p) => !(p as { _deleted?: boolean })._deleted)
        .sort((a, b) => (b.paid_at ?? '').localeCompare(a.paid_at ?? ''));
      return right(
        filtered.map((r) => PaymentMapper.toEntity(r as unknown as PaymentModel)),
      );
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  async sumCashByShift(shiftId: string): Promise<Either<Failure, number>> {
    try {
      const rows = await this.localDb
        .getDB()
        .payments.where('cashier_shift_id')
        .equals(shiftId)
        .toArray();
      const total = rows
        .filter((p) => !(p as { _deleted?: boolean })._deleted)
        .filter((p) => (p as { method?: string }).method === 'efectivo')
        .filter((p) => p.status === 'completed')
        .reduce(
          (acc, p) => acc + ((p as { amount_cents?: number }).amount_cents ?? 0),
          0,
        );
      return right(total);
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }
}
