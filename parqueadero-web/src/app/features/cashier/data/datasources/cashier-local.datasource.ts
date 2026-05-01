import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NotFoundFailure, ServerFailure } from '../../../../core/either/failures';
import { PowerSyncService } from '../../../../core/services/powersync.service';
import { CashierShiftEntity } from '../../domain/entities/cashier-shift.entity';
import {
  OpenShiftParams,
  CloseShiftParams,
  ListShiftsParams,
  ListShiftsResult,
  RegisterWithdrawalParams,
} from '../../domain/repositories/cashier.repository';
import { CashWithdrawalEntity } from '../../domain/entities/cash-withdrawal.entity';
import { CashierShiftMapper, CashierShiftModel } from '../models/cashier-shift.model';
import { CashierDataSource } from './cashier.datasource';

interface CashierSqlRow extends Omit<CashierShiftModel, '_deleted'> {
  _deleted: number;
}

function rowToModel(r: CashierSqlRow): CashierShiftModel {
  return { ...r, _deleted: Boolean(r._deleted) };
}

@Injectable()
export class CashierLocalDataSource extends CashierDataSource {
  private get db() { return this.ps.db; }

  constructor(private readonly ps: PowerSyncService) { super(); }

  async findOpenByUser(userId: string): Promise<Either<Failure, CashierShiftEntity | null>> {
    try {
      const rows = await this.db.getAll<CashierSqlRow>(
        `SELECT * FROM cashier_shifts
         WHERE user_id = ? AND status = 'open' AND (_deleted IS NULL OR _deleted = 0)
         LIMIT 1`,
        [userId],
      );
      return right(rows[0] ? CashierShiftMapper.toEntity(rowToModel(rows[0])) : null);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async findById(shiftId: string): Promise<Either<Failure, CashierShiftEntity | null>> {
    try {
      const rows = await this.db.getAll<CashierSqlRow>(
        `SELECT * FROM cashier_shifts WHERE id = ? LIMIT 1`,
        [shiftId],
      );
      return right(rows[0] ? CashierShiftMapper.toEntity(rowToModel(rows[0])) : null);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async create(params: OpenShiftParams): Promise<Either<Failure, CashierShiftEntity>> {
    try {
      const id = crypto.randomUUID();
      const ts = new Date().toISOString();
      await this.db.execute(
        `INSERT INTO cashier_shifts
          (id, user_id, opening_balance_cents, status, opened_at, _deleted, created_at, updated_at)
         VALUES (?, ?, ?, 'open', ?, 0, ?, ?)`,
        [id, params.userId, params.openingBalanceCents, ts, ts, ts],
      );
      const rows = await this.db.getAll<CashierSqlRow>(
        `SELECT * FROM cashier_shifts WHERE id = ?`,
        [id],
      );
      if (!rows[0]) return left(new ServerFailure('Turno no encontrado tras crear'));
      return right(CashierShiftMapper.toEntity(rowToModel(rows[0])));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async listShifts(_params: ListShiftsParams): Promise<Either<Failure, ListShiftsResult>> {
    // El historial de turnos se consulta sólo online (no se cachea en local).
    return left(new ServerFailure('listShifts no disponible offline'));
  }

  async registerWithdrawal(
    _params: RegisterWithdrawalParams,
  ): Promise<Either<Failure, CashWithdrawalEntity>> {
    // Los retiros parciales requieren conexión por consistencia con audit_log.
    return left(new ServerFailure('registerWithdrawal requiere conexión'));
  }

  async listWithdrawalsByShift(_shiftId: string): Promise<Either<Failure, CashWithdrawalEntity[]>> {
    return left(new ServerFailure('listWithdrawalsByShift no disponible offline'));
  }

  async close(params: CloseShiftParams): Promise<Either<Failure, CashierShiftEntity>> {
    try {
      const ts = new Date().toISOString();
      await this.db.execute(
        `UPDATE cashier_shifts
         SET status = 'closed', closed_at = ?, closing_balance_cents = ?,
             expected_balance_cents = ?, difference_cents = ?,
             justification = ?, updated_at = ?
         WHERE id = ?`,
        [
          ts,
          params.closingBalanceCents,
          params.expectedBalanceCents,
          params.differenceCents,
          params.justification ?? null,
          ts,
          params.shiftId,
        ],
      );
      const rows = await this.db.getAll<CashierSqlRow>(
        `SELECT * FROM cashier_shifts WHERE id = ?`,
        [params.shiftId],
      );
      if (!rows[0]) return left(new NotFoundFailure('Turno no encontrado', 'cashier_shift'));
      return right(CashierShiftMapper.toEntity(rowToModel(rows[0])));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }
}
