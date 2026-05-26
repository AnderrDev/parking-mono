import { Injectable, inject } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import {
  Failure,
  NotFoundFailure,
  ServerFailure,
} from '../../../../core/either/failures';
import {
  CashierShiftModel as LocalCashierShiftModel,
  LocalDbService,
  ParkingSessionModel as LocalParkingSessionModel,
  PaymentModel as LocalPaymentModel,
  VehicleModel as LocalVehicleModel,
} from '../../../../core/services/local-db.service';
import { SyncOrchestrator } from '../../../../core/services/sync-orchestrator.service';
import { PaginationMeta as Pagination } from '../../../../shared/models/pagination.model';
import {
  ParkingSessionEntity,
  VehicleType,
} from '../../domain/entities/parking-session.entity';
import { VehicleEntity } from '../../domain/entities/vehicle.entity';
import { MonthlyPlanEntity } from '../../domain/entities/monthly-plan.entity';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import { VehicleHistoryStats } from '../../domain/entities/vehicle-history-stats.entity';
import {
  ActiveSessionsFilter,
  ActiveSessionsSort,
  CancelSessionParams,
  ListSessionsParams,
  ListSessionsResult,
  OpenShiftSummary,
  RegisterEntryParams,
  RegisterExitParams,
  RegisterExitResult,
} from '../../domain/repositories/parking.repository';
import {
  MonthlyPlanMapper,
  MonthlyPlanModel,
} from '../models/monthly-plan.model';
import {
  ParkingSessionMapper,
  ParkingSessionModel,
} from '../models/parking-session.model';
import { PaymentMapper, PaymentModel } from '../models/payment.model';
import { TariffMapper, TariffModel } from '../models/tariff.model';
import { VehicleMapper, VehicleModel } from '../models/vehicle.model';
import {
  ActiveSessionsPage,
  ParkingDataSource,
  VehicleSearchData,
} from './parking.datasource';

// ──────────────────────────────────────────────────────────────────────────────
// ParkingLocalDataSource — Sprint 2 (Fase 8 — outbox de escritura).
//
// Hidrata/escribe el mirror Dexie y encola las mutaciones en la outbox para
// drain posterior. Se usa como FALLBACK desde ParkingRepositoryImpl cuando:
//   1. networkInfo.isOnline() === false, o
//   2. la operación remota falló con NetworkFailure (timeout / CORS / offline mid-flight).
//
// Reglas:
// - Las escrituras generan UUIDv4 cliente-side (`crypto.randomUUID()`) para `id`
//   y un `client_op_id` distinto para idempotencia de la outbox.
// - Las filas escritas llevan `_sync_status='pending'` en Dexie hasta que el
//   drain las refresque a `'synced'` vía `applyMirror`.
// - Las lecturas usan los mismos índices declarados en `local-db.service.ts` v2.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class ParkingLocalDataSource extends ParkingDataSource {
  private readonly localDb = inject(LocalDbService);
  private readonly orchestrator = inject(SyncOrchestrator);

  // ── WRITES ────────────────────────────────────────────────────────────────

  async insertSession(
    params: RegisterEntryParams,
  ): Promise<Either<Failure, ParkingSessionEntity>> {
    try {
      const now = new Date();
      const id = crypto.randomUUID();
      const opId = crypto.randomUUID();

      const row: ParkingSessionModel & {
        _deleted: boolean;
        client_op_id: string;
      } = {
        id,
        vehicle_plate: params.plate,
        vehicle_type: params.vehicleType,
        entry_at: now.toISOString(),
        entry_user_id: params.userId,
        status: 'active',
        monthly_plan_id: params.monthlyPlanId,
        tariff_id: null,
        exit_at: null,
        exit_user_id: null,
        amount_due_cents: 0,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        _sync_status: 'pending',
        // Snapshot de tarifa: el flujo offline no resuelve la tarifa al
        // ingreso (no tiene acceso al remoto). Cuando la sesión sincroniza
        // vía outbox, el servidor o un retry posterior puede setear estos
        // campos; por ahora quedan null y el display cae al fallback.
        tariff_snapshot_name: null,
        tariff_snapshot_per_minute_cents: null,
        tariff_snapshot_per_hour_cents: null,
        tariff_snapshot_plena_cents: null,
        _deleted: false,
        client_op_id: opId,
      };

      const db = this.localDb.getDB();

      // Mirror local del vehículo (best-effort). El server hace un upsert por
      // placa con `onConflict: 'plate', ignoreDuplicates: true`; aquí hacemos
      // un `put` local para que searchVehicle/searchPlateSuggestions offline
      // puedan resolver la placa sin haber sincronizado todavía.
      try {
        const existing = await db.vehicles.where('plate').equals(params.plate).first();
        if (!existing) {
          const vehicleRow: LocalVehicleModel = {
            id: crypto.randomUUID(),
            plate: params.plate,
            vehicle_type: params.vehicleType,
            color: params.color,
            brand: params.brand,
            // owner_customer_id se omite (opcional)
            updated_at: now.toISOString(),
            created_at: now.toISOString(),
            _deleted: false,
          };
          await db.vehicles.put(vehicleRow);
        }
      } catch {
        /* best-effort: no falla la entrada si el upsert local del vehículo no anda */
      }

      await db.parking_sessions.put(row as unknown as LocalParkingSessionModel);

      // El insert del vehículo es local-only; no se encola porque el remote
      // ya lo upsertea dentro de `insertSession` del remoteDs. Si se inserta
      // offline y la sesión drena, el server ejecuta la FK contra `vehicles`
      // por placa; la fila del vehículo se sincroniza por separado al
      // siguiente snapshot pull. Si no existe en el server, el INSERT de la
      // sesión NO la requiere (no hay FK directa de parking_sessions.vehicle_plate
      // → vehicles.plate; solo es un texto). OK.

      await this.orchestrator.enqueue({
        opId,
        table: 'parking_sessions',
        operation: 'insert',
        payload: this.stripLocalFields(row as unknown as Record<string, unknown>),
        rowId: id,
        enqueuedAt: now,
        attempts: 0,
        status: 'pending',
      });

      return right(
        ParkingSessionMapper.toEntity(row as unknown as ParkingSessionModel),
      );
    } catch (e) {
      return left(new ServerFailure(`Persistencia local falló: ${String(e)}`));
    }
  }

  async closeSession(
    params: RegisterExitParams,
  ): Promise<Either<Failure, RegisterExitResult>> {
    try {
      const now = new Date();
      const db = this.localDb.getDB();

      const existing = await db.parking_sessions.get(params.sessionId);
      if (!existing) {
        return left(
          new NotFoundFailure('Sesión no encontrada localmente', 'parking_session'),
        );
      }

      // 1) Update sesión.
      const sessionPatch = {
        exit_at: params.exitAt.toISOString(),
        status: 'completed',
        amount_due_cents: params.amountCents,
        exit_user_id: params.userId,
        updated_at: now.toISOString(),
      };
      const updatedSession: LocalParkingSessionModel = {
        ...(existing as LocalParkingSessionModel),
        ...sessionPatch,
        _sync_status: 'pending',
      };
      await db.parking_sessions.put(updatedSession);

      const opIdUpdate = crypto.randomUUID();
      await this.orchestrator.enqueue({
        opId: opIdUpdate,
        table: 'parking_sessions',
        operation: 'update',
        payload: sessionPatch,
        rowId: params.sessionId,
        enqueuedAt: now,
        attempts: 0,
        status: 'pending',
      });

      // 2) Insert pago (siempre se registra, incluso si amount=0 — el UC ya
      //    decide el método 'cortesia/error/mensual' con amount=0).
      const paymentId = crypto.randomUUID();
      const opIdPay = crypto.randomUUID();
      const paymentRow: PaymentModel & {
        _deleted: boolean;
        client_op_id: string;
      } = {
        id: paymentId,
        session_id: params.sessionId,
        cashier_shift_id: params.cashierShiftId,
        method: params.paymentMethod,
        amount_cents: params.amountCents,
        status: 'completed',
        paid_at: now.toISOString(),
        justification: params.justification,
        invoice_id: null,
        gateway_ref: null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        _deleted: false,
        client_op_id: opIdPay,
      };

      const localPaymentRow: LocalPaymentModel = {
        id: paymentRow.id,
        cashier_shift_id: paymentRow.cashier_shift_id,
        paid_at: paymentRow.paid_at,
        status: paymentRow.status,
        _sync_status: 'pending',
        client_op_id: opIdPay,
        // El resto de campos quedan como `unknown` extra (index signature lo permite).
        session_id: paymentRow.session_id,
        method: paymentRow.method,
        amount_cents: paymentRow.amount_cents,
        justification: paymentRow.justification,
        invoice_id: paymentRow.invoice_id,
        gateway_ref: paymentRow.gateway_ref,
        created_at: paymentRow.created_at,
        updated_at: paymentRow.updated_at,
        _deleted: false,
      };
      await db.payments.put(localPaymentRow);

      await this.orchestrator.enqueue({
        opId: opIdPay,
        table: 'payments',
        operation: 'insert',
        payload: this.stripLocalFields(paymentRow as unknown as Record<string, unknown>),
        rowId: paymentId,
        // +1ms para garantizar FIFO posterior al update — incluso con timers de
        // baja resolución, el sortBy('enqueuedAt') respeta el orden.
        enqueuedAt: new Date(now.getTime() + 1),
        attempts: 0,
        status: 'pending',
      });

      return right({
        session: ParkingSessionMapper.toEntity(
          updatedSession as unknown as ParkingSessionModel,
        ),
        payment: PaymentMapper.toEntity(paymentRow as unknown as PaymentModel),
      });
    } catch (e) {
      return left(new ServerFailure(`Persistencia local falló: ${String(e)}`));
    }
  }

  async cancelSession(
    params: CancelSessionParams,
  ): Promise<Either<Failure, ParkingSessionEntity>> {
    try {
      const now = new Date();
      const db = this.localDb.getDB();
      const existing = await db.parking_sessions.get(params.sessionId);
      if (!existing) {
        return left(
          new NotFoundFailure('Sesión no encontrada localmente', 'parking_session'),
        );
      }
      const sessionPatch = {
        status: 'cancelled',
        updated_at: now.toISOString(),
      };
      const updated: LocalParkingSessionModel = {
        ...(existing as LocalParkingSessionModel),
        ...sessionPatch,
        _sync_status: 'pending',
      };
      await db.parking_sessions.put(updated);

      const opId = crypto.randomUUID();
      await this.orchestrator.enqueue({
        opId,
        table: 'parking_sessions',
        operation: 'update',
        payload: sessionPatch,
        rowId: params.sessionId,
        enqueuedAt: now,
        attempts: 0,
        status: 'pending',
      });

      // Sprint 3 — refund encolado. Si la sesión tenía un pago asociado,
      // marcamos el payment como 'refunded' en el mirror y encolamos el
      // UPDATE correspondiente. El timestamp `enqueuedAt: now+1ms` garantiza
      // FIFO (la cancelación de la sesión drena primero). El server-side
      // hace lo mismo inline en la cancelación remota; offline lo hacemos
      // explícito para que el drain refleje ambos cambios.
      if (params.paymentId) {
        try {
          const localPayment = await db.payments.get(params.paymentId);
          if (localPayment) {
            const paymentPatch = {
              status: 'refunded',
              updated_at: now.toISOString(),
            };
            const updatedPayment: LocalPaymentModel = {
              ...(localPayment as LocalPaymentModel),
              ...paymentPatch,
              _sync_status: 'pending',
            };
            await db.payments.put(updatedPayment);

            const opIdRefund = crypto.randomUUID();
            await this.orchestrator.enqueue({
              opId: opIdRefund,
              table: 'payments',
              operation: 'update',
              payload: paymentPatch,
              rowId: params.paymentId,
              enqueuedAt: new Date(now.getTime() + 1),
              attempts: 0,
              status: 'pending',
            });
          }
        } catch (err) {
          // Best-effort: si falla el lookup local, el server resolverá el
          // refund cuando reciba la cancelación.
          console.warn('[cancelSession] no se pudo encolar refund local', err);
        }
      }

      return right(
        ParkingSessionMapper.toEntity(updated as unknown as ParkingSessionModel),
      );
    } catch (e) {
      return left(new ServerFailure(`Persistencia local falló: ${String(e)}`));
    }
  }

  // ── READS ─────────────────────────────────────────────────────────────────

  async getActiveSessionByPlate(
    plate: string,
  ): Promise<Either<Failure, ParkingSessionEntity | null>> {
    try {
      const row = await this.localDb
        .getDB()
        .parking_sessions.where('vehicle_plate')
        .equals(plate)
        .and((r) => r.status === 'active' && !(r as { _deleted?: boolean })._deleted)
        .first();
      return right(
        row ? ParkingSessionMapper.toEntity(row as unknown as ParkingSessionModel) : null,
      );
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  async getActiveSessions(
    filter: ActiveSessionsFilter,
    pagination: { page: number; pageSize: number },
    sort: ActiveSessionsSort,
  ): Promise<Either<Failure, ActiveSessionsPage>> {
    try {
      const db = this.localDb.getDB();
      let rows = await db.parking_sessions
        .where('status')
        .equals('active')
        .filter((r) => !(r as { _deleted?: boolean })._deleted)
        .toArray();

      if (filter.vehicleType) {
        rows = rows.filter(
          (r) => (r as { vehicle_type?: string }).vehicle_type === filter.vehicleType,
        );
      }
      if (filter.minDurationMinutes != null) {
        const cutoff = Date.now() - filter.minDurationMinutes * 60_000;
        rows = rows.filter((r) => new Date(r.entry_at).getTime() <= cutoff);
      }

      // Sort in-memory.
      const sortKey = sort.field;
      const dir = sort.direction === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        if (sortKey === 'plate') {
          return a.vehicle_plate.localeCompare(b.vehicle_plate) * dir;
        }
        // entryAt | duration → ambas equivalentes a entry_at (la duración crece
        // monotónicamente con la antigüedad de entry_at, mientras siga activa).
        return (
          (new Date(a.entry_at).getTime() - new Date(b.entry_at).getTime()) * dir
        );
      });

      const total = rows.length;
      const offset = (pagination.page - 1) * pagination.pageSize;
      const slice = rows.slice(offset, offset + pagination.pageSize);

      return right({
        data: slice.map((r) =>
          ParkingSessionMapper.toEntity(r as unknown as ParkingSessionModel),
        ),
        pagination: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
        } satisfies Pagination,
      });
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  async searchVehicle(query: string): Promise<Either<Failure, VehicleSearchData>> {
    try {
      const db = this.localDb.getDB();
      const upper = query.toUpperCase();

      // Vehículo más recientemente actualizado que contenga el patrón.
      const allVehicles = await db.vehicles.toArray();
      const matches = allVehicles
        .filter((v) => !(v as { _deleted?: boolean })._deleted)
        .filter((v) => v.plate.toUpperCase().includes(upper))
        .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
      const vehicleRow = matches[0] ?? null;
      const vehicle = vehicleRow
        ? VehicleMapper.toEntity(vehicleRow as unknown as VehicleModel)
        : null;

      const targetPlate = vehicle?.plate ?? null;

      // Sesiones activas y últimas 5 completadas.
      const allSessions = await db.parking_sessions.toArray();
      const filtered = allSessions.filter((s) => {
        if ((s as { _deleted?: boolean })._deleted) return false;
        const plate = (s.vehicle_plate ?? '').toUpperCase();
        return targetPlate
          ? plate === targetPlate.toUpperCase()
          : plate.includes(upper);
      });
      const activeSessions = filtered
        .filter((s) => s.status === 'active')
        .map((s) =>
          ParkingSessionMapper.toEntity(s as unknown as ParkingSessionModel),
        );
      const lastSessions = filtered
        .filter((s) => s.status === 'completed')
        .sort((a, b) => {
          const aExit = (a as { exit_at?: string | null }).exit_at ?? '';
          const bExit = (b as { exit_at?: string | null }).exit_at ?? '';
          return bExit.localeCompare(aExit);
        })
        .slice(0, 5)
        .map((s) =>
          ParkingSessionMapper.toEntity(s as unknown as ParkingSessionModel),
        );

      // Plan vigente.
      const today = new Date().toISOString().slice(0, 10);
      const plans = await db.monthly_plans.toArray();
      const planRow = plans
        .filter((p) => !(p as { _deleted?: boolean })._deleted)
        .filter((p) => p.status === 'active' || p.status === 'expiring')
        .filter((p) => p.end_date >= today)
        .filter((p) => {
          const plate = (p.vehicle_plate ?? '').toUpperCase();
          return targetPlate
            ? plate === targetPlate.toUpperCase()
            : plate.includes(upper);
        })
        .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''))[0];
      const monthlyPlan = planRow
        ? MonthlyPlanMapper.toEntity(planRow as unknown as MonthlyPlanModel)
        : null;

      return right({ vehicle, activeSessions, lastSessions, monthlyPlan });
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  async searchPlateSuggestions(
    query: string,
    limit: number,
    onlyActive: boolean,
  ): Promise<Either<Failure, VehicleEntity[]>> {
    try {
      const upper = query.toUpperCase();
      const db = this.localDb.getDB();

      if (onlyActive) {
        const sessions = await db.parking_sessions
          .where('status')
          .equals('active')
          .filter((s) => !(s as { _deleted?: boolean })._deleted)
          .toArray();
        const filtered = sessions
          .filter((s) => (s.vehicle_plate ?? '').toUpperCase().includes(upper))
          .sort((a, b) => (b.entry_at ?? '').localeCompare(a.entry_at ?? ''))
          .slice(0, limit);
        return right(
          filtered.map((s) => {
            const r = s as unknown as ParkingSessionModel & {
              color?: string | null;
              brand?: string | null;
            };
            return new VehicleEntity(
              r.id,
              new Date(r.entry_at),
              new Date(r.updated_at ?? r.entry_at),
              r.vehicle_plate,
              r.vehicle_type as VehicleType,
              r.color ?? null,
              r.brand ?? null,
              null,
              false,
            );
          }),
        );
      }

      const vehicles = await db.vehicles.toArray();
      const filtered = vehicles
        .filter((v) => !(v as { _deleted?: boolean })._deleted)
        .filter((v) => v.plate.toUpperCase().includes(upper))
        .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
        .slice(0, limit);
      return right(
        filtered.map((v) => VehicleMapper.toEntity(v as unknown as VehicleModel)),
      );
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  async getVehicleHistoryStats(
    plate: string,
    recentLimit: number,
  ): Promise<Either<Failure, VehicleHistoryStats>> {
    try {
      // Best-effort offline: solo lo que tengamos en el mirror del operador
      // (día actual + sesiones completadas que el snapshot pull haya traído).
      const sessions = await this.localDb
        .getDB()
        .parking_sessions.where('vehicle_plate')
        .equals(plate)
        .and((s) =>
          s.status === 'completed' && !(s as { _deleted?: boolean })._deleted,
        )
        .toArray();
      const entities = sessions
        .map((s) =>
          ParkingSessionMapper.toEntity(s as unknown as ParkingSessionModel),
        )
        .sort((a, b) => {
          const aT = a.exitAt?.getTime() ?? 0;
          const bT = b.exitAt?.getTime() ?? 0;
          return bT - aT;
        });

      if (entities.length === 0) {
        return right({
          totalVisits: 0,
          totalPaidCents: 0,
          totalDurationMinutes: 0,
          averagePaidCents: 0,
          averageDurationMinutes: 0,
          firstVisitAt: null,
          lastVisitAt: null,
          visitsLast30Days: 0,
          paidLast30DaysCents: 0,
          recentSessions: [],
        });
      }

      const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
      let totalPaid = 0;
      let totalDuration = 0;
      let firstVisitMs = Infinity;
      let lastVisitMs = -Infinity;
      let visits30 = 0;
      let paid30 = 0;
      for (const s of entities) {
        const paid = s.amountDueCents ?? 0;
        totalPaid += paid;
        totalDuration += s.durationMinutes;
        const entryMs = s.entryAt.getTime();
        const exitMs = s.exitAt ? s.exitAt.getTime() : entryMs;
        if (entryMs < firstVisitMs) firstVisitMs = entryMs;
        if (exitMs > lastVisitMs) lastVisitMs = exitMs;
        if (exitMs >= cutoff30) {
          visits30 += 1;
          paid30 += paid;
        }
      }
      const totalVisits = entities.length;
      return right({
        totalVisits,
        totalPaidCents: totalPaid,
        totalDurationMinutes: totalDuration,
        averagePaidCents: Math.round(totalPaid / totalVisits),
        averageDurationMinutes: Math.round(totalDuration / totalVisits),
        firstVisitAt: firstVisitMs === Infinity ? null : new Date(firstVisitMs),
        lastVisitAt: lastVisitMs === -Infinity ? null : new Date(lastVisitMs),
        visitsLast30Days: visits30,
        paidLast30DaysCents: paid30,
        recentSessions: entities.slice(0, recentLimit),
      });
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  async getOpenCashierShiftId(
    userId: string,
  ): Promise<Either<Failure, string | null>> {
    try {
      const row = await this.localDb
        .getDB()
        .cashier_shifts.where('[user_id+status]')
        .equals([userId, 'open'])
        .first();
      return right(
        (row as LocalCashierShiftModel | undefined)?.['_deleted'] === true
          ? null
          : (row?.id ?? null),
      );
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  async getOpenShiftSummary(
    userId: string,
  ): Promise<Either<Failure, OpenShiftSummary | null>> {
    try {
      const row = (await this.localDb
        .getDB()
        .cashier_shifts.where('[user_id+status]')
        .equals([userId, 'open'])
        .first()) as
        | (LocalCashierShiftModel & {
            opened_at?: string;
            opening_balance_cents?: number;
          })
        | undefined;
      if (!row || row['_deleted'] === true) return right(null);
      return right({
        shiftId: row.id,
        openedAt: new Date(row.opened_at ?? ''),
        openingBalanceCents: row.opening_balance_cents ?? 0,
      });
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  async getActivePlanByPlate(
    plate: string,
  ): Promise<Either<Failure, MonthlyPlanEntity | null>> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await this.localDb
        .getDB()
        .monthly_plans.where('vehicle_plate')
        .equals(plate)
        .toArray();
      const filtered = rows
        .filter((p) => !(p as { _deleted?: boolean })._deleted)
        .filter((p) => p.status === 'active' || p.status === 'expiring')
        .filter((p) => p.end_date >= today)
        .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''));
      const planRow = filtered[0];
      return right(
        planRow
          ? MonthlyPlanMapper.toEntity(planRow as unknown as MonthlyPlanModel)
          : null,
      );
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  async getActiveTariff(
    vehicleType: VehicleType,
  ): Promise<Either<Failure, TariffEntity>> {
    try {
      const rows = await this.localDb
        .getDB()
        .tariffs.where('vehicle_type')
        .equals(vehicleType)
        .toArray();
      const tariff = rows
        .filter((t) => {
          // Snapshot pull persiste `is_active` como llega del server (boolean
          // según el schema), pero el tipo local lo declara `number` por el
          // índice Dexie. Aceptamos ambas representaciones.
          const v = (t as { is_active?: unknown }).is_active;
          return v === 1 || v === true;
        })
        .filter((t) => (t as { unit?: string }).unit !== 'mensualidad')
        .filter((t) => !(t as { _deleted?: boolean })._deleted)[0];
      if (!tariff) {
        return left(
          new NotFoundFailure(
            `No hay tarifa activa para tipo de vehículo: ${vehicleType}`,
            'tariff',
          ),
        );
      }
      return right(TariffMapper.toEntity(tariff as unknown as TariffModel));
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  async listSessions(
    params: ListSessionsParams,
  ): Promise<Either<Failure, ListSessionsResult>> {
    try {
      // Offline: solo podemos listar lo que está en el mirror — sesiones del
      // operador del día actual (snapshot pull) + las pending del outbox.
      const all = await this.localDb.getDB().parking_sessions.toArray();
      let filtered = all.filter((s) => !(s as { _deleted?: boolean })._deleted);
      if (params.dateFrom) {
        const f = params.dateFrom.getTime();
        filtered = filtered.filter((s) => new Date(s.entry_at).getTime() >= f);
      }
      if (params.dateTo) {
        const t = params.dateTo.getTime();
        filtered = filtered.filter((s) => new Date(s.entry_at).getTime() <= t);
      }
      if (params.vehicleType) {
        filtered = filtered.filter(
          (s) => (s as { vehicle_type?: string }).vehicle_type === params.vehicleType,
        );
      }
      if (params.plate) {
        const up = params.plate.toUpperCase();
        filtered = filtered.filter((s) =>
          (s.vehicle_plate ?? '').toUpperCase().includes(up),
        );
      }
      if (params.status && params.status !== 'all') {
        filtered = filtered.filter((s) => s.status === params.status);
      }
      filtered.sort((a, b) => (b.entry_at ?? '').localeCompare(a.entry_at ?? ''));
      const total = filtered.length;
      const offset = (params.page - 1) * params.pageSize;
      const page = filtered.slice(offset, offset + params.pageSize);
      return right({
        data: page.map((s) =>
          ParkingSessionMapper.toEntity(s as unknown as ParkingSessionModel),
        ),
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
        } satisfies Pagination,
      });
    } catch (e) {
      return left(new ServerFailure(`Lectura local falló: ${String(e)}`));
    }
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  /**
   * Elimina campos puramente locales del payload que se envía al server. El
   * drain envía el row completo en `insert`; el server desconoce `_sync_status`
   * (acepta el default 'synced') pero no debe recibir basura interna del mirror.
   */
  private stripLocalFields(
    row: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      // Server-side _sync_status tiene default 'synced'; el cliente no necesita
      // mandarlo. Lo dejamos pasar igual: si el server lo acepta, no cambia
      // semántica; si no, lo strippeará PostgREST por column-level RLS.
      if (k === '_sync_status') continue;
      out[k] = v;
    }
    return out;
  }

}
