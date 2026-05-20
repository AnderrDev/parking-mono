import { Injectable, inject } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import {
  Failure,
  BusinessRuleFailure,
  NotFoundFailure,
  ServerFailure,
} from '../../../../core/either/failures';
import {
  CashWithdrawalModel as LocalCashWithdrawalModel,
  CashierShiftModel as LocalCashierShiftModel,
  LocalDbService,
} from '../../../../core/services/local-db.service';
import { SyncOrchestrator } from '../../../../core/services/sync-orchestrator.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { CashWithdrawalEntity } from '../../domain/entities/cash-withdrawal.entity';
import { CashierShiftEntity } from '../../domain/entities/cashier-shift.entity';
import {
  CloseShiftParams,
  ListShiftsParams,
  ListShiftsResult,
  OpenShiftParams,
  RegisterWithdrawalParams,
} from '../../domain/repositories/cashier.repository';
import {
  CashierShiftMapper,
  CashierShiftModel,
} from '../models/cashier-shift.model';
import { CashierDataSource } from './cashier.datasource';

// ──────────────────────────────────────────────────────────────────────────────
// CashierLocalDataSource — Sprint 2 (Fase 8).
//
// Persiste turnos y retiros en el mirror Dexie (cashier_shifts y
// cash_withdrawals — esta última añadida en Dexie v2) y encola las mutaciones
// en outbox.
//
// `listShifts` offline solo devuelve los turnos del operador presentes en el
// mirror (snapshot pull restringe al día actual). Es una limitación aceptada
// — el módulo de reportería/admin asume conexión.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class CashierLocalDataSource extends CashierDataSource {
  private readonly localDb = inject(LocalDbService);
  private readonly orchestrator = inject(SyncOrchestrator);

  async findOpenByUser(
    userId: string,
  ): Promise<Either<Failure, CashierShiftEntity | null>> {
    try {
      const row = (await this.localDb
        .getDB()
        .cashier_shifts.where('[user_id+status]')
        .equals([userId, 'open'])
        .first()) as LocalCashierShiftModel | undefined;
      if (!row || row['_deleted'] === true) return right(null);
      return right(
        CashierShiftMapper.toEntity(row as unknown as CashierShiftModel),
      );
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  async findById(
    shiftId: string,
  ): Promise<Either<Failure, CashierShiftEntity | null>> {
    try {
      const row = (await this.localDb
        .getDB()
        .cashier_shifts.get(shiftId)) as LocalCashierShiftModel | undefined;
      if (!row || row['_deleted'] === true) return right(null);
      return right(
        CashierShiftMapper.toEntity(row as unknown as CashierShiftModel),
      );
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  async create(
    params: OpenShiftParams,
  ): Promise<Either<Failure, CashierShiftEntity>> {
    try {
      // Validación local de uq_shifts_open_per_user (best-effort — el UC ya
      // valida antes, pero si el mirror tiene un turno abierto del propio
      // usuario, rechazamos para evitar enviar al drain una mutación que
      // será marcada como conflict).
      const existing = (await this.localDb
        .getDB()
        .cashier_shifts.where('[user_id+status]')
        .equals([params.userId, 'open'])
        .first()) as LocalCashierShiftModel | undefined;
      if (existing && existing['_deleted'] !== true) {
        return left(
          new BusinessRuleFailure('Ya tienes un turno abierto'),
        );
      }

      const now = new Date();
      const id = crypto.randomUUID();
      const opId = crypto.randomUUID();
      const row: CashierShiftModel & { client_op_id: string } = {
        id,
        user_id: params.userId,
        status: 'open',
        opening_balance_cents: params.openingBalanceCents,
        opened_at: now.toISOString(),
        closing_balance_cents: null,
        expected_balance_cents: null,
        difference_cents: null,
        closed_at: null,
        justification: null,
        _deleted: false,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        client_op_id: opId,
      };

      const localRow: LocalCashierShiftModel = {
        id: row.id,
        user_id: row.user_id,
        status: row.status,
        client_op_id: opId,
        _sync_status: 'pending',
        opening_balance_cents: row.opening_balance_cents,
        opened_at: row.opened_at,
        closing_balance_cents: row.closing_balance_cents,
        expected_balance_cents: row.expected_balance_cents,
        difference_cents: row.difference_cents,
        closed_at: row.closed_at,
        justification: row.justification,
        _deleted: false,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
      await this.localDb.getDB().cashier_shifts.put(localRow);

      await this.orchestrator.enqueue({
        opId,
        table: 'cashier_shifts',
        operation: 'insert',
        payload: {
          id,
          user_id: params.userId,
          opening_balance_cents: params.openingBalanceCents,
          status: 'open',
          opened_at: row.opened_at,
        },
        rowId: id,
        enqueuedAt: now,
        attempts: 0,
        status: 'pending',
      });

      return right(
        CashierShiftMapper.toEntity(row as unknown as CashierShiftModel),
      );
    } catch (e) {
      return left(new ServerFailure(`Persistencia local falló: ${String(e)}`));
    }
  }

  async close(
    params: CloseShiftParams,
  ): Promise<Either<Failure, CashierShiftEntity>> {
    try {
      const now = new Date();
      const db = this.localDb.getDB();
      const existing = (await db.cashier_shifts.get(params.shiftId)) as
        | LocalCashierShiftModel
        | undefined;
      if (!existing) {
        return left(
          new NotFoundFailure('Turno no encontrado localmente', 'cashier_shift'),
        );
      }
      const patch = {
        status: 'closed',
        closing_balance_cents: params.closingBalanceCents,
        expected_balance_cents: params.expectedBalanceCents,
        difference_cents: params.differenceCents,
        justification: params.justification,
        closed_at: now.toISOString(),
        updated_at: now.toISOString(),
      };
      const updated: LocalCashierShiftModel = {
        ...existing,
        ...patch,
        _sync_status: 'pending',
      };
      await db.cashier_shifts.put(updated);

      const opId = crypto.randomUUID();
      await this.orchestrator.enqueue({
        opId,
        table: 'cashier_shifts',
        operation: 'update',
        payload: patch,
        rowId: params.shiftId,
        enqueuedAt: now,
        attempts: 0,
        status: 'pending',
      });

      return right(
        CashierShiftMapper.toEntity(updated as unknown as CashierShiftModel),
      );
    } catch (e) {
      return left(new ServerFailure(`Persistencia local falló: ${String(e)}`));
    }
  }

  async listShifts(
    params: ListShiftsParams,
  ): Promise<Either<Failure, ListShiftsResult>> {
    try {
      const all = await this.localDb.getDB().cashier_shifts.toArray();
      let rows = all.filter((s) => !(s as { _deleted?: boolean })._deleted);
      if (params.userId) {
        rows = rows.filter((s) => s.user_id === params.userId);
      }
      if (params.dateFrom) {
        const f = params.dateFrom.getTime();
        rows = rows.filter(
          (s) =>
            new Date((s as { opened_at?: string }).opened_at ?? 0).getTime() >= f,
        );
      }
      if (params.dateTo) {
        const t = params.dateTo.getTime();
        rows = rows.filter(
          (s) =>
            new Date((s as { opened_at?: string }).opened_at ?? 0).getTime() <= t,
        );
      }
      if (params.onlyWithDifference) {
        rows = rows.filter(
          (s) => (s as { difference_cents?: number }).difference_cents !== 0,
        );
      }
      rows.sort((a, b) =>
        (
          (b as { opened_at?: string }).opened_at ?? ''
        ).localeCompare((a as { opened_at?: string }).opened_at ?? ''),
      );

      const total = rows.length;
      const offset = (params.page - 1) * params.pageSize;
      const page = rows.slice(offset, offset + params.pageSize);

      // Sin red no tenemos el nombre del operador (no se replica `users` al
      // mirror). Devolvemos '—' como placeholder.
      const data = page.map((s) => ({
        shift: CashierShiftMapper.toEntity(s as unknown as CashierShiftModel),
        operatorName: '—',
      }));
      const pagination: PaginationMeta = {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
      };
      return right({ data, pagination });
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  async registerWithdrawal(
    params: RegisterWithdrawalParams,
  ): Promise<Either<Failure, CashWithdrawalEntity>> {
    try {
      const now = new Date();
      const id = crypto.randomUUID();
      const opId = crypto.randomUUID();
      const row: LocalCashWithdrawalModel = {
        id,
        shift_id: params.shiftId,
        user_id: params.userId,
        amount_cents: params.amountCents,
        recipient: params.recipient,
        justification: params.justification,
        withdrawn_at: now.toISOString(),
        client_op_id: opId,
        _sync_status: 'pending',
        // Campos auxiliares para el mirror — el server los inicializa con
        // sus defaults (created_at/updated_at = now(), _deleted = false).
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        _deleted: false,
      };
      await this.localDb.getDB().cash_withdrawals.put(row);

      await this.orchestrator.enqueue({
        opId,
        table: 'cash_withdrawals',
        operation: 'insert',
        payload: {
          id,
          shift_id: params.shiftId,
          user_id: params.userId,
          amount_cents: params.amountCents,
          recipient: params.recipient,
          justification: params.justification,
          withdrawn_at: row.withdrawn_at,
        },
        rowId: id,
        enqueuedAt: now,
        attempts: 0,
        status: 'pending',
      });

      return right(
        new CashWithdrawalEntity(
          id,
          now,
          now,
          params.shiftId,
          params.userId,
          params.amountCents,
          params.recipient,
          params.justification,
          now,
        ),
      );
    } catch (e) {
      return left(new ServerFailure(`Persistencia local falló: ${String(e)}`));
    }
  }

  async listWithdrawalsByShift(
    shiftId: string,
  ): Promise<Either<Failure, CashWithdrawalEntity[]>> {
    try {
      const rows = await this.localDb
        .getDB()
        .cash_withdrawals.where('shift_id')
        .equals(shiftId)
        .toArray();
      const filtered = rows
        .filter((w) => !(w as { _deleted?: boolean })._deleted)
        .sort((a, b) =>
          (b.withdrawn_at ?? '').localeCompare(a.withdrawn_at ?? ''),
        );
      return right(
        filtered.map(
          (r) =>
            new CashWithdrawalEntity(
              r.id,
              new Date(
                (r as { created_at?: string }).created_at ?? r.withdrawn_at,
              ),
              new Date(
                (r as { updated_at?: string }).updated_at ?? r.withdrawn_at,
              ),
              r.shift_id,
              r.user_id,
              r.amount_cents,
              r.recipient,
              r.justification,
              new Date(r.withdrawn_at),
            ),
        ),
      );
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }
}
