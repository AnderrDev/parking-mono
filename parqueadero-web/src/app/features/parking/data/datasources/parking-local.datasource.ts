import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NotFoundFailure, ServerFailure } from '../../../../core/either/failures';
import { PowerSyncService } from '../../../../core/services/powersync.service';
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
  ListSessionsParams,
  ListSessionsResult,
  CancelSessionParams,
} from '../../domain/repositories/parking.repository';
import { ParkingSessionMapper, ParkingSessionModel } from '../models/parking-session.model';
import { MonthlyPlanMapper, MonthlyPlanModel } from '../models/monthly-plan.model';
import { TariffMapper, TariffModel } from '../models/tariff.model';
import { PaymentMapper, PaymentModel } from '../models/payment.model';
import { VehicleMapper } from '../models/vehicle.model';
import {
  ParkingDataSource,
  ActiveSessionsPage,
  VehicleSearchData,
} from './parking.datasource';

function now(): string {
  return new Date().toISOString();
}

@Injectable()
export class ParkingLocalDataSource extends ParkingDataSource {
  private get db() { return this.ps.db; }

  constructor(private readonly ps: PowerSyncService) {
    super();
  }

  async insertSession(params: RegisterEntryParams): Promise<Either<Failure, ParkingSessionEntity>> {
    try {
      const id = crypto.randomUUID();
      const entryAt = now();
      const ts = now();
      // Persistimos color/brand en `vehicles` (no en parking_sessions). Si ya existe el
      // vehículo, conservamos sus datos: ON CONFLICT DO NOTHING.
      await this.db.execute(
        `INSERT INTO vehicles
          (id, plate, type, color, brand, created_at, updated_at, _deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(plate) DO NOTHING`,
        [
          crypto.randomUUID(),
          params.plate,
          params.vehicleType,
          params.color ?? null,
          params.brand ?? null,
          ts,
          ts,
        ],
      );
      await this.db.execute(
        `INSERT INTO parking_sessions
          (id, vehicle_plate, vehicle_type, entry_user_id,
           monthly_plan_id, entry_at, status, _sync_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', 'pending', ?, ?)`,
        [
          id,
          params.plate,
          params.vehicleType,
          params.userId,
          params.monthlyPlanId ?? null,
          entryAt,
          ts,
          ts,
        ],
      );
      const rows = await this.db.getAll<ParkingSessionModel>(
        `SELECT * FROM parking_sessions WHERE id = ?`,
        [id],
      );
      if (!rows[0]) return left(new ServerFailure('Sesión no encontrada tras el registro'));
      return right(ParkingSessionMapper.toEntity(rows[0]));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async getActiveSessionByPlate(
    plate: string,
  ): Promise<Either<Failure, ParkingSessionEntity | null>> {
    try {
      const rows = await this.db.getAll<ParkingSessionModel>(
        `SELECT * FROM parking_sessions
         WHERE vehicle_plate = ? AND status = 'active' AND (_deleted IS NULL OR _deleted = 0)
         LIMIT 1`,
        [plate],
      );
      const row = rows[0];
      return right(row ? ParkingSessionMapper.toEntity(row) : null);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async getActiveSessions(
    filter: ActiveSessionsFilter,
    pagination: { page: number; pageSize: number },
    sort: ActiveSessionsSort,
  ): Promise<Either<Failure, ActiveSessionsPage>> {
    try {
      const conditions: string[] = [
        `status = 'active'`,
        `(_deleted IS NULL OR _deleted = 0)`,
      ];
      const bindings: unknown[] = [];

      if (filter.vehicleType) {
        conditions.push(`vehicle_type = ?`);
        bindings.push(filter.vehicleType);
      }

      const where = conditions.join(' AND ');
      const sortCol = sort.field === 'plate' ? 'vehicle_plate' : 'entry_at';
      const dir = sort.direction === 'asc' ? 'ASC' : 'DESC';
      const offset = (pagination.page - 1) * pagination.pageSize;

      const countRows = await this.db.getAll<{ total: number }>(
        `SELECT COUNT(*) as total FROM parking_sessions WHERE ${where}`,
        bindings,
      );
      const total = countRows[0]?.total ?? 0;

      const dataRows = await this.db.getAll<ParkingSessionModel>(
        `SELECT * FROM parking_sessions WHERE ${where}
         ORDER BY ${sortCol} ${dir}
         LIMIT ? OFFSET ?`,
        [...bindings, pagination.pageSize, offset],
      );

      return right({
        data: dataRows.map((r) => ParkingSessionMapper.toEntity(r)),
        pagination: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          total,
          totalPages: Math.ceil(total / pagination.pageSize) || 1,
        },
      });
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async searchVehicle(query: string): Promise<Either<Failure, VehicleSearchData>> {
    try {
      interface VehicleSqlRow {
        id: string; plate: string; type: string;
        color: string | null; brand: string | null;
        owner_customer_id: string | null;
        created_at: string; updated_at: string; _deleted: number;
      }

      // Búsqueda parcial: tomamos el vehículo más recientemente actualizado que
      // contenga el fragmento. Si no hay match en `vehicles`, intentamos sesiones por
      // coincidencia parcial en `vehicle_plate`.
      const pattern = `%${query}%`;
      const vehicleRows = await this.db.getAll<VehicleSqlRow>(
        `SELECT * FROM vehicles
         WHERE plate LIKE ? AND (_deleted IS NULL OR _deleted = 0)
         ORDER BY updated_at DESC LIMIT 1`,
        [pattern],
      );

      const vRow = vehicleRows[0];
      const sessionPlateClause = vRow ? 'vehicle_plate = ?' : 'vehicle_plate LIKE ?';
      const sessionPlateBind = vRow ? vRow.plate : pattern;

      const [activeRows, historyRows, planRows] = await Promise.all([
        this.db.getAll<ParkingSessionModel>(
          `SELECT * FROM parking_sessions
           WHERE ${sessionPlateClause} AND status = 'active' AND (_deleted IS NULL OR _deleted = 0)`,
          [sessionPlateBind],
        ),
        this.db.getAll<ParkingSessionModel>(
          `SELECT * FROM parking_sessions
           WHERE ${sessionPlateClause} AND status = 'completed' AND (_deleted IS NULL OR _deleted = 0)
           ORDER BY exit_at DESC LIMIT 5`,
          [sessionPlateBind],
        ),
        this.db.getAll<MonthlyPlanModel>(
          `SELECT * FROM monthly_plans
           WHERE ${sessionPlateClause} AND status IN ('active', 'expiring')
             AND (_deleted IS NULL OR _deleted = 0)
           ORDER BY end_date DESC LIMIT 1`,
          [sessionPlateBind],
        ),
      ]);

      return right({
        vehicle: vRow
          ? VehicleMapper.toEntity({
              id: vRow.id,
              plate: vRow.plate,
              vehicle_type: vRow.type,
              color: vRow.color ?? null,
              brand: vRow.brand ?? null,
              owner_customer_id: vRow.owner_customer_id ?? null,
              created_at: vRow.created_at,
              updated_at: vRow.updated_at,
              _deleted: Boolean(vRow._deleted),
            })
          : null,
        activeSessions: activeRows.map(ParkingSessionMapper.toEntity),
        lastSessions: historyRows.map(ParkingSessionMapper.toEntity),
        monthlyPlan: planRows[0] ? MonthlyPlanMapper.toEntity(planRows[0]) : null,
      });
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async getOpenCashierShiftId(userId: string): Promise<Either<Failure, string | null>> {
    try {
      const rows = await this.db.getAll<{ id: string }>(
        `SELECT id FROM cashier_shifts
         WHERE user_id = ? AND status = 'open' AND (_deleted IS NULL OR _deleted = 0)
         LIMIT 1`,
        [userId],
      );
      return right(rows[0]?.id ?? null);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async getActivePlanByPlate(plate: string): Promise<Either<Failure, MonthlyPlanEntity | null>> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await this.db.getAll<MonthlyPlanModel>(
        `SELECT * FROM monthly_plans
         WHERE vehicle_plate = ?
           AND status IN ('active', 'expiring')
           AND end_date >= ?
           AND (_deleted IS NULL OR _deleted = 0)
         LIMIT 1`,
        [plate, today],
      );
      return right(rows[0] ? MonthlyPlanMapper.toEntity(rows[0]) : null);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async closeSession(params: RegisterExitParams): Promise<Either<Failure, RegisterExitResult>> {
    try {
      const paymentId = crypto.randomUUID();
      const exitAt = params.exitAt.toISOString();
      const ts = now();
      const paymentStatus = FREE_PAYMENT_METHODS.includes(params.paymentMethod) ? 'completed' : 'completed';

      await this.db.writeTransaction(async (tx) => {
        await tx.execute(
          `UPDATE parking_sessions
           SET exit_at = ?, status = 'completed', amount_due_cents = ?, exit_user_id = ?,
               _sync_status = 'pending', updated_at = ?
           WHERE id = ?`,
          [exitAt, params.amountCents, params.userId, ts, params.sessionId],
        );
        await tx.execute(
          `INSERT INTO payments
            (id, session_id, cashier_shift_id, method, amount_cents, status, paid_at,
             _sync_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
          [
            paymentId,
            params.sessionId,
            params.cashierShiftId,
            params.paymentMethod,
            params.amountCents,
            paymentStatus,
            ts,
            ts,
            ts,
          ],
        );
      });

      const sessionRows = await this.db.getAll<ParkingSessionModel>(
        `SELECT * FROM parking_sessions WHERE id = ?`,
        [params.sessionId],
      );
      if (!sessionRows[0]) {
        return left(new NotFoundFailure('Sesión no encontrada tras el cierre', 'parking_session'));
      }
      const paymentRows = await this.db.getAll<PaymentModel>(
        `SELECT * FROM payments WHERE id = ?`,
        [paymentId],
      );
      if (!paymentRows[0]) {
        return left(new ServerFailure('Pago no encontrado tras el registro'));
      }

      return right({
        session: ParkingSessionMapper.toEntity(sessionRows[0]),
        payment: PaymentMapper.toEntity(paymentRows[0]),
      });
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async getActiveTariff(vehicleType: VehicleType): Promise<Either<Failure, TariffEntity>> {
    try {
      const rows = await this.db.getAll<TariffModel>(
        `SELECT * FROM tariffs
         WHERE vehicle_type = ? AND is_active = 1 AND (_deleted IS NULL OR _deleted = 0)
         LIMIT 1`,
        [vehicleType],
      );
      if (!rows[0]) {
        return left(
          new NotFoundFailure(
            `No hay tarifa activa para tipo de vehículo: ${vehicleType}`,
            'tariff',
          ),
        );
      }
      const raw = rows[0];
      const model: TariffModel = {
        ...raw,
        schedule_json: raw.schedule_json
          ? (typeof raw.schedule_json === 'string'
              ? JSON.parse(raw.schedule_json as unknown as string)
              : raw.schedule_json)
          : { 'lunes-domingo': '00:00-23:59' },
        is_active: Boolean(raw.is_active),
        _deleted: Boolean(raw._deleted),
      };
      return right(TariffMapper.toEntity(model));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async listSessions(_params: ListSessionsParams): Promise<Either<Failure, ListSessionsResult>> {
    // El historial completo se consulta sólo online.
    return left(new ServerFailure('listSessions no disponible offline'));
  }

  async cancelSession(_params: CancelSessionParams): Promise<Either<Failure, ParkingSessionEntity>> {
    // Anular sesiones requiere conexión: trigger audit + refund payment del lado servidor.
    return left(new ServerFailure('cancelSession requiere conexión'));
  }
}
