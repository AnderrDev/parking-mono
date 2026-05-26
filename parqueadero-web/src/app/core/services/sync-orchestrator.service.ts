import {
  Injectable,
  OnDestroy,
  Signal,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Subscription } from 'rxjs';
import { AuthStateService } from './auth-state.service';
import { LocalDbService, OutboxOperation } from './local-db.service';
import { NetworkInfoService } from './network-info.service';
import { SupabaseService } from './supabase.service';
import { TelemetryService } from './telemetry.service';

export type ConflictResolution = 'discard' | 'retry';

type MirrorTable =
  | 'tariffs'
  | 'monthly_plans'
  | 'customers'
  | 'vehicles'
  | 'app_settings'
  | 'parking_sessions'
  | 'payments'
  | 'cashier_shifts'
  | 'cash_withdrawals';

interface RealtimeRetryState {
  attempts: number;
  timer?: ReturnType<typeof setTimeout>;
}

interface PullResult {
  ok: boolean;
  err?: unknown;
}

// ──────────────────────────────────────────────────────────────────────────────
// BroadcastChannel — coordinación multi-pestaña (Sprint 3).
// Una sola pestaña drena a la vez (la primera en publicar `drain:start`);
// las demás reciben `enqueue`/`conflict`/`resolve` para refrescar counts.
// ──────────────────────────────────────────────────────────────────────────────
type SyncBroadcastMsg =
  | { type: 'drain:start'; tabId: string; at: number }
  | { type: 'drain:end'; tabId: string; processedCount: number; at: number }
  | { type: 'enqueue'; tabId: string; table: string; opId: string; at: number }
  | { type: 'conflict'; tabId: string; opId: string; at: number }
  | {
      type: 'resolve';
      tabId: string;
      opId: string;
      resolution: ConflictResolution;
      at: number;
    }
  | { type: 'logout'; tabId: string; at: number };

// ──────────────────────────────────────────────────────────────────────────────
// Resultados del drain por operación.
// `409_idempotent` → row recuperado por client_op_id, tratar como éxito.
// `409`             → conflicto real (uq_sessions_active, uq_shifts_open_per_user, STALE_WRITE…).
// `unauthorized`    → 401/403/PGRST301/RLS; detiene el bucle del drain.
// `4xx`             → 400/404/422/FK/CHECK; status='failed'.
// `5xx` / `network` / `429` → reintento con backoff.
// ──────────────────────────────────────────────────────────────────────────────
type ApplyResultKind =
  | 'ok'
  | '409_idempotent'
  | '409'
  | 'unauthorized'
  | '4xx'
  | '5xx'
  | '429'
  | 'network';

type ApplyResult =
  | { ok: true; row: Record<string, unknown>; kind?: 'ok' | '409_idempotent' }
  | {
      ok: false;
      kind: Exclude<ApplyResultKind, 'ok' | '409_idempotent'>;
      message?: string;
      serverRow?: Record<string, unknown>;
    };

// ──────────────────────────────────────────────────────────────────────────────
// Orquestador de sincronización offline (Fase 8 — operador-only).
//
// Sprint 0: esqueleto con outbox enqueue + signals + suscripción isOnline$.
// Sprint 1: mirror real de los 5 catálogos vía snapshotPull() + Supabase Realtime.
// Sprint 2: drain() real de la outbox (FIFO, backoff exp, 409 idempotente).
// Sprint 3: BroadcastChannel multi-pestaña + telemetry + resolveConflict real
//   + mapeo P0409 (stale-write) + notifyLogout.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class SyncOrchestrator implements OnDestroy {
  private readonly localDb = inject(LocalDbService);
  private readonly networkInfo = inject(NetworkInfoService);
  private readonly supabase = inject(SupabaseService);
  private readonly authState = inject(AuthStateService);
  private readonly telemetry = inject(TelemetryService);

  // ── Constantes del drain ─────────────────────────────────────────────────
  private static readonly MAX_ATTEMPTS = 10;
  private static readonly BASE_BACKOFF_MS = 1_000;
  private static readonly MAX_BACKOFF_MS = 30_000;
  private static readonly DRAIN_TICK_MS = 30_000;
  private static readonly OUTBOX_OVERFLOW_THRESHOLD = 200;
  private static readonly EXTERNAL_DRAIN_TIMEOUT_MS = 60_000;
  private static readonly BROADCAST_CHANNEL_NAME = 'parqueadero-sync';

  // Estado interno (writable). Sólo los `asReadonly()` se exponen.
  private readonly _pendingCount = signal(0);
  private readonly _conflictCount = signal(0);
  private readonly _syncing = signal(false);
  private readonly _lastSyncAt = signal<Date | null>(null);
  private readonly _draining = signal(false);
  private readonly _activeShiftId = signal<string | null>(null);

  /** Número de mutaciones en outbox con status='pending'. */
  readonly pendingCount: Signal<number> = this._pendingCount.asReadonly();
  /** Número de items en estado 'conflict' pendientes de revisión manual. */
  readonly conflictCount: Signal<number> = this._conflictCount.asReadonly();
  /** True mientras hay un drain o snapshot en curso. */
  readonly syncing: Signal<boolean> = this._syncing.asReadonly();
  /** Timestamp del último drain/snapshot exitoso. Null si nunca corrió. */
  readonly lastSyncAt: Signal<Date | null> = this._lastSyncAt.asReadonly();

  // Subscription a NetworkInfoService.isOnline$ — se desuscribe al destroy.
  private _networkSub?: Subscription;
  private _wasOnline: boolean | null = null;
  private _initialized = false;

  // Sprint 1 — Realtime mirror.
  private _realtimeChannels: RealtimeChannel[] = [];
  private _realtimeRetry = new Map<MirrorTable, RealtimeRetryState>();
  private _snapshotInFlight: Promise<void> | null = null;

  // Sprint 2 — timer periódico de drain (cada 30s mientras online && pending>0).
  private _drainTimer?: ReturnType<typeof setInterval>;

  // Sprint 3 — BroadcastChannel multi-pestaña.
  // `_externalDraining` se setea cuando otra pestaña anuncia drain:start; en
  // ese caso este orquestador se abstiene de drenar para no duplicar trabajo
  // ni quemar reintentos cruzados. Si la otra pestaña muere sin emitir
  // drain:end, el timeout libera la guarda automáticamente.
  private readonly _tabId = `tab-${this.shortId()}`;
  private _channel: BroadcastChannel | null = null;
  private _externalDraining = false;
  private _externalDrainerTabId: string | null = null;
  private _externalDrainTimer?: ReturnType<typeof setTimeout>;

  private _ninetyDaysAgoIso = new Date(
    Date.now() - 90 * 24 * 3600_000,
  ).toISOString();

  constructor() {
    // allowSignalWrites: el effect orquesta dos lados (login/logout). El
    // login dispara snapshotPull() que escribe _syncing/_activeShiftId; el
    // logout limpia _activeShiftId. Ambos son writes legítimos a partir de
    // un cambio en authState.currentUser(), no un ciclo reactivo.
    effect(() => {
      const user = this.authState.currentUser();
      if (
        user != null &&
        this._realtimeChannels.length === 0 &&
        this._initialized
      ) {
        void this.snapshotPull().then(() => this.setupRealtimeChannels());
        this.startDrainTimer();
      } else if (user == null && this._realtimeChannels.length > 0) {
        this.teardownRealtimeChannels();
        this.stopDrainTimer();
        this._activeShiftId.set(null);
      }
    }, { allowSignalWrites: true });
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;

    // Multi-tab antes que nada: queremos enterarnos del drain de otras
    // pestañas incluso si Dexie falla.
    this.initBroadcast();

    try {
      this.localDb.getDB();
      await this.refreshCounts();
    } catch (err) {
      console.warn('[SyncOrchestrator] no se pudo abrir Dexie', err);
    }

    this._networkSub = this.networkInfo.isOnline$.subscribe((online) => {
      const wasOnline = this._wasOnline;
      this._wasOnline = online;
      if (wasOnline === false && online === true) {
        void this.drain();
        if (this.authState.currentUser() != null) {
          void this.snapshotPull();
        }
      }
    });

    if (this.authState.currentUser() != null) {
      void this.snapshotPull().then(() => this.setupRealtimeChannels());
      this.startDrainTimer();
      if (this._pendingCount() > 0 && this.networkInfo.isOnline()) {
        void this.drain();
      }
    }
  }

  async snapshotPull(): Promise<void> {
    if (this._snapshotInFlight) return this._snapshotInFlight;
    if (this.authState.currentUser() == null) return;

    this._syncing.set(true);
    this._snapshotInFlight = (async () => {
      try {
        this._ninetyDaysAgoIso = new Date(
          Date.now() - 90 * 24 * 3600_000,
        ).toISOString();

        const userId = this.authState.currentUser()?.id;
        const operatorChain: Promise<PullResult>[] = userId
          ? [
              this.pullActiveSessions(userId),
              this.pullActiveShift(userId).then((r) => {
                if (r.ok && r.shiftId) {
                  return this.pullActiveShiftPayments(r.shiftId);
                }
                return r;
              }),
            ]
          : [];

        const results = await Promise.allSettled([
          this.pullTariffs(),
          this.pullMonthlyPlans(),
          this.pullCustomers(this._ninetyDaysAgoIso),
          this.pullVehicles(this._ninetyDaysAgoIso),
          this.pullAppSettings(),
          ...operatorChain,
        ]);

        const allOk = results.every(
          (r) => r.status === 'fulfilled' && r.value.ok,
        );
        if (allOk) this._lastSyncAt.set(new Date());

        for (const r of results) {
          if (
            r.status === 'rejected' ||
            (r.status === 'fulfilled' && !r.value.ok)
          ) {
            console.warn('[snapshotPull] fallo parcial', r);
          }
        }

        if (this.authState.currentUser() == null) {
          await this.localDb.clear().catch((err) => {
            console.warn('[snapshotPull] clear defensivo falló', err);
          });
        }
      } finally {
        this._syncing.set(false);
        this._snapshotInFlight = null;
      }
    })();
    return this._snapshotInFlight;
  }

  // ── Pull helpers (privados) ────────────────────────────────────────────────

  private async pullTariffs(): Promise<PullResult> {
    try {
      const { data, error } = await this.supabase.client
        .from('tariffs')
        .select('*')
        .eq('is_active', true)
        .eq('_deleted', false);
      if (error) return { ok: false, err: error };
      if (this.authState.currentUser() == null) return { ok: false };

      const db = this.localDb.getDB();
      await db.transaction('rw', db.tariffs, async () => {
        await db.tariffs.clear();
        const rows = (data ?? []).map((r) =>
          this.normalize('tariffs', r as Record<string, unknown>),
        );
        if (rows.length) await db.tariffs.bulkPut(rows as never);
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, err: e };
    }
  }

  private async pullMonthlyPlans(): Promise<PullResult> {
    try {
      const { data, error } = await this.supabase.client
        .from('monthly_plans')
        .select('*')
        .in('status', ['active', 'expiring'])
        .eq('_deleted', false);
      if (error) return { ok: false, err: error };
      if (this.authState.currentUser() == null) return { ok: false };

      const db = this.localDb.getDB();
      await db.transaction('rw', db.monthly_plans, async () => {
        await db.monthly_plans.clear();
        const rows = (data ?? []).map((r) =>
          this.normalize('monthly_plans', r as Record<string, unknown>),
        );
        if (rows.length) await db.monthly_plans.bulkPut(rows as never);
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, err: e };
    }
  }

  private async pullCustomers(ninetyDaysAgoIso: string): Promise<PullResult> {
    try {
      const { data, error } = await this.supabase.client
        .from('customers')
        .select('*')
        .gte('updated_at', ninetyDaysAgoIso)
        .eq('_deleted', false);
      if (error) return { ok: false, err: error };
      if (this.authState.currentUser() == null) return { ok: false };

      const db = this.localDb.getDB();
      await db.transaction('rw', db.customers, async () => {
        await db.customers.clear();
        const rows = (data ?? []).map((r) =>
          this.normalize('customers', r as Record<string, unknown>),
        );
        if (rows.length) await db.customers.bulkPut(rows as never);
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, err: e };
    }
  }

  private async pullVehicles(ninetyDaysAgoIso: string): Promise<PullResult> {
    try {
      const { data, error } = await this.supabase.client
        .from('vehicles')
        .select('*')
        .gte('updated_at', ninetyDaysAgoIso)
        .eq('_deleted', false);
      if (error) return { ok: false, err: error };
      if (this.authState.currentUser() == null) return { ok: false };

      const db = this.localDb.getDB();
      await db.transaction('rw', db.vehicles, async () => {
        await db.vehicles.clear();
        const rows = (data ?? []).map((r) =>
          this.normalize('vehicles', r as Record<string, unknown>),
        );
        if (rows.length) await db.vehicles.bulkPut(rows as never);
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, err: e };
    }
  }

  private async pullAppSettings(): Promise<PullResult> {
    try {
      const { data, error } = await this.supabase.client
        .from('app_settings')
        .select('*');
      if (error) return { ok: false, err: error };
      if (this.authState.currentUser() == null) return { ok: false };

      const db = this.localDb.getDB();
      await db.transaction('rw', db.app_settings, async () => {
        await db.app_settings.clear();
        const rows = (data ?? []).map((r) =>
          this.normalize('app_settings', r as Record<string, unknown>),
        );
        if (rows.length) await db.app_settings.bulkPut(rows as never);
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, err: e };
    }
  }

  private async pullActiveSessions(userId: string): Promise<PullResult> {
    try {
      const { data, error } = await this.supabase.client
        .from('parking_sessions')
        .select('*')
        .eq('entry_user_id', userId)
        .eq('status', 'active')
        .eq('_deleted', false);
      if (error) return { ok: false, err: error };
      if (this.authState.currentUser() == null) return { ok: false };

      const db = this.localDb.getDB();
      await db.transaction('rw', db.parking_sessions, async () => {
        const pendingRows = await db.parking_sessions
          .filter((r) => (r as Record<string, unknown>)['_sync_status'] === 'pending')
          .toArray();
        const pendingIds = new Set(pendingRows.map((r) => r.id));
        await db.parking_sessions.clear();
        for (const p of pendingRows) await db.parking_sessions.put(p);
        const rows = (data ?? [])
          .map((r) => r as Record<string, unknown>)
          .filter((r) => !pendingIds.has(r['id'] as string))
          .map((r) => ({ ...r, _sync_status: 'synced' }));
        if (rows.length) await db.parking_sessions.bulkPut(rows as never);
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, err: e };
    }
  }

  private async pullActiveShift(
    userId: string,
  ): Promise<PullResult & { shiftId?: string }> {
    try {
      const { data, error } = await this.supabase.client
        .from('cashier_shifts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'open')
        .eq('_deleted', false)
        .maybeSingle();
      if (error) return { ok: false, err: error };
      if (this.authState.currentUser() == null) return { ok: false };

      const db = this.localDb.getDB();
      await db.transaction('rw', db.cashier_shifts, async () => {
        const pendingRows = await db.cashier_shifts
          .filter((r) => (r as Record<string, unknown>)['_sync_status'] === 'pending')
          .toArray();
        await db.cashier_shifts.clear();
        for (const p of pendingRows) await db.cashier_shifts.put(p);
        if (data) {
          await db.cashier_shifts.put({
            ...(data as Record<string, unknown>),
            _sync_status: 'synced',
          } as never);
        }
      });

      const shiftId = (data as Record<string, unknown> | null)?.['id'] as
        | string
        | undefined;
      this._activeShiftId.set(shiftId ?? null);
      return shiftId ? { ok: true, shiftId } : { ok: true };
    } catch (e) {
      return { ok: false, err: e };
    }
  }

  private async pullActiveShiftPayments(shiftId: string): Promise<PullResult> {
    try {
      const { data, error } = await this.supabase.client
        .from('payments')
        .select('*')
        .eq('cashier_shift_id', shiftId)
        .eq('_deleted', false);
      if (error) return { ok: false, err: error };
      if (this.authState.currentUser() == null) return { ok: false };

      const db = this.localDb.getDB();
      await db.transaction('rw', db.payments, async () => {
        const pendingRows = await db.payments
          .filter((r) => (r as Record<string, unknown>)['_sync_status'] === 'pending')
          .toArray();
        const pendingIds = new Set(pendingRows.map((r) => r.id));
        await db.payments.clear();
        for (const p of pendingRows) await db.payments.put(p);
        const rows = (data ?? [])
          .map((r) => r as Record<string, unknown>)
          .filter((r) => !pendingIds.has(r['id'] as string))
          .map((r) => ({ ...r, _sync_status: 'synced' }));
        if (rows.length) await db.payments.bulkPut(rows as never);
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, err: e };
    }
  }

  // ── Realtime ───────────────────────────────────────────────────────────────

  private subscribeRealtime(table: MirrorTable): RealtimeChannel {
    const channelName = `realtime:mirror:${table}`;
    const channel = this.supabase.client
      .channel(channelName)
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table },
        (payload: unknown) => {
          void this.handleRealtimeDelta(table, payload as RealtimePayload);
        },
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          const prev = this._realtimeRetry.get(table);
          if (prev?.timer) clearTimeout(prev.timer);
          this._realtimeRetry.set(table, { attempts: 0 });
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          this.scheduleRealtimeReconnect(table);
        }
      });
    this._realtimeChannels.push(channel);
    return channel;
  }

  private async handleRealtimeDelta(
    table: MirrorTable,
    payload: RealtimePayload,
  ): Promise<void> {
    try {
      const eventType = payload?.eventType;
      const newRow = payload?.new ?? null;
      const oldRow = payload?.old ?? null;
      const db = this.localDb.getDB();
      const tbl = (db as unknown as Record<string, Dexie.Table<unknown, unknown> | undefined>)[
        table
      ];
      if (!tbl) return;
      const pkField = table === 'app_settings' ? 'key' : 'id';

      if (eventType === 'DELETE') {
        const id = (oldRow as Record<string, unknown> | null)?.[pkField] as
          | string
          | undefined;
        if (id != null) await tbl.delete(id);
        return;
      }

      if (newRow == null) return;

      const rawRow = newRow as Record<string, unknown>;
      const row = this.normalize(table, rawRow);
      if (!this.matchesScope(table, row)) {
        const id = rawRow[pkField] as string | undefined;
        if (id != null) await tbl.delete(id);
        return;
      }

      if (this.isMutableTable(table)) {
        const id = rawRow[pkField] as string | undefined;
        if (id != null) {
          const local = (await tbl.get(id)) as
            | Record<string, unknown>
            | undefined;
          if (local && local['_sync_status'] === 'pending') {
            const localOpId = local['client_op_id'];
            const serverOpId = rawRow['client_op_id'];
            if (
              localOpId != null &&
              serverOpId != null &&
              localOpId !== serverOpId
            ) {
              return;
            }
          }
          await tbl.put({ ...row, _sync_status: 'synced' });
          return;
        }
      }

      await tbl.put(row);
    } catch (err) {
      console.warn('[handleRealtimeDelta] error aplicando delta', table, err);
    }
  }

  private scheduleRealtimeReconnect(table: MirrorTable): void {
    const state: RealtimeRetryState =
      this._realtimeRetry.get(table) ?? { attempts: 0 };
    state.attempts += 1;
    const base = Math.min(30_000, 1000 * Math.pow(2, state.attempts - 1));
    const jitter = Math.random() * 500;
    const delay = base + jitter;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => this.reopenChannel(table), delay);
    this._realtimeRetry.set(table, state);
    if (state.attempts > 3) {
      this._syncing.set(true);
    }
  }

  private reopenChannel(table: MirrorTable): void {
    const suffix = `mirror:${table}`;
    const existing = this._realtimeChannels.find((c) =>
      (c as unknown as { topic: string }).topic.endsWith(suffix),
    );
    if (existing) {
      void this.supabase.client.removeChannel(existing);
      this._realtimeChannels = this._realtimeChannels.filter(
        (c) => c !== existing,
      );
    }
    this.subscribeRealtime(table);
  }

  private setupRealtimeChannels(): void {
    if (this._realtimeChannels.length > 0) return;
    this.subscribeRealtime('tariffs');
    this.subscribeRealtime('monthly_plans');
    this.subscribeRealtime('customers');
    this.subscribeRealtime('vehicles');
    this.subscribeRealtime('app_settings');
    this.subscribeRealtime('parking_sessions');
    this.subscribeRealtime('payments');
    this.subscribeRealtime('cashier_shifts');
    this.subscribeRealtime('cash_withdrawals');
  }

  private teardownRealtimeChannels(): void {
    for (const ch of this._realtimeChannels) {
      void this.supabase.client.removeChannel(ch);
    }
    this._realtimeChannels = [];
    for (const s of this._realtimeRetry.values()) {
      if (s.timer) clearTimeout(s.timer);
    }
    this._realtimeRetry.clear();
  }

  // ── Normalización y scope ──────────────────────────────────────────────────

  private normalize(
    table: MirrorTable,
    row: Record<string, unknown>,
  ): Record<string, unknown> {
    if (table === 'tariffs') {
      const isActive = row['is_active'];
      return {
        ...row,
        is_active:
          isActive === true || isActive === 1 || isActive === '1' ? 1 : 0,
      };
    }
    return { ...row };
  }

  private isMutableTable(table: MirrorTable): boolean {
    return (
      table === 'parking_sessions' ||
      table === 'payments' ||
      table === 'cashier_shifts' ||
      table === 'cash_withdrawals'
    );
  }

  private matchesScope(
    table: MirrorTable,
    row: Record<string, unknown>,
  ): boolean {
    if (row['_deleted'] === true) return false;
    if (table === 'tariffs') {
      return row['is_active'] === 1;
    }
    if (table === 'monthly_plans') {
      const status = row['status'];
      return status === 'active' || status === 'expiring';
    }
    if (table === 'customers' || table === 'vehicles') {
      const updatedAt = row['updated_at'];
      return (
        typeof updatedAt === 'string' && updatedAt >= this._ninetyDaysAgoIso
      );
    }
    if (table === 'app_settings') return true;

    const userId = this.authState.currentUser()?.id;
    if (userId == null) return false;

    if (table === 'parking_sessions') {
      return (
        row['entry_user_id'] === userId &&
        row['status'] === 'active' &&
        row['_deleted'] !== true
      );
    }
    if (table === 'cashier_shifts') {
      return row['user_id'] === userId && row['_deleted'] !== true;
    }
    if (table === 'payments') {
      const activeShiftId = this._activeShiftId();
      if (activeShiftId == null) return false;
      return row['cashier_shift_id'] === activeShiftId;
    }
    if (table === 'cash_withdrawals') {
      const activeShiftId = this._activeShiftId();
      if (activeShiftId == null) return false;
      return row['shift_id'] === activeShiftId;
    }
    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //                              DRAIN REAL
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Drena la outbox FIFO contra Supabase.
   *
   * Sprint 3:
   * - Si otra pestaña está drenando (_externalDraining), salimos para no
   *   duplicar trabajo. La guarda se libera al recibir drain:end o por timeout.
   * - Emite eventos de telemetría (sync_attempted/sync_drain_started/ended).
   * - Broadcast `drain:start` / `drain:end` para coordinación multi-tab.
   */
  async drain(): Promise<void> {
    if (this._draining()) {
      this.telemetry.captureEvent('sync_attempted', { skipped: 'already_draining' });
      return;
    }
    if (this._externalDraining) {
      this.telemetry.captureEvent('sync_attempted', { skipped: 'external_draining' });
      return;
    }
    if (!this.networkInfo.isOnline()) {
      this.telemetry.captureEvent('sync_attempted', { skipped: 'offline' });
      return;
    }
    if (this.authState.currentUser() == null) {
      this.telemetry.captureEvent('sync_attempted', { skipped: 'no_session' });
      return;
    }

    this._draining.set(true);
    this._syncing.set(true);
    this.broadcast({ type: 'drain:start' });
    this.telemetry.captureEvent('sync_drain_started', {
      pendingCount: this._pendingCount(),
    });

    const t0 = performance.now();
    let processedCount = 0;
    let failedCount = 0;
    let conflictCount = 0;
    let processedOk = false;

    try {
      const db = this.localDb.getDB();
      let safetyBudget = 1_000;
      while (safetyBudget-- > 0) {
        if (!this.networkInfo.isOnline()) break;
        if (this.authState.currentUser() == null) break;

        const now = new Date();
        const candidates = await db.outbox
          .where('status')
          .equals('pending')
          .sortBy('enqueuedAt');
        const item = candidates.find(
          (o) => !o.nextAttemptAt || o.nextAttemptAt <= now,
        );
        if (!item) break;

        if ((item.attempts ?? 0) >= SyncOrchestrator.MAX_ATTEMPTS) {
          item.status = 'failed';
          item.lastError = item.lastError ?? 'max_attempts_exceeded';
          await db.outbox.put(item);
          failedCount++;
          continue;
        }

        item.status = 'in_flight';
        item.lastAttemptAt = now;
        await db.outbox.put(item);

        const result = await this.applyOutboxItem(item);

        if (result.ok) {
          await this.applyMirror(item, result.row);
          await db.outbox.delete(item.opId);
          processedOk = true;
          processedCount++;
          continue;
        }

        switch (result.kind) {
          case '409': {
            item.status = 'conflict';
            item.lastError = result.message ?? 'conflict';
            const conflictRow: import('./local-db.service').SyncConflict = {
              opId: item.opId,
              table: item.table,
              localPayload: item.payload,
              detectedAt: now,
              reason: result.message ?? 'conflict',
            };
            if (result.serverRow) conflictRow.serverPayload = result.serverRow;
            await db.conflicts.put(conflictRow);
            await db.outbox.put(item);
            conflictCount++;
            this.telemetry.captureWarning('sync_conflict', {
              table: item.table,
              opId: item.opId,
              reason: result.message ?? 'conflict',
            });
            this.broadcast({ type: 'conflict', opId: item.opId });
            break;
          }
          case 'unauthorized': {
            item.status = 'failed';
            item.lastError = result.message ?? 'unauthorized';
            await db.outbox.put(item);
            failedCount++;
            await this.refreshCounts();
            return;
          }
          case '4xx': {
            item.status = 'failed';
            item.lastError = result.message ?? 'client_error';
            await db.outbox.put(item);
            failedCount++;
            break;
          }
          case '5xx':
          case '429':
          case 'network': {
            const multiplier = result.kind === '429' ? 2 : 1;
            item.attempts = (item.attempts ?? 0) + 1;
            const base = Math.min(
              SyncOrchestrator.MAX_BACKOFF_MS,
              SyncOrchestrator.BASE_BACKOFF_MS * Math.pow(2, item.attempts - 1),
            );
            const jitter = Math.random() * 500;
            item.nextAttemptAt = new Date(
              now.getTime() + base * multiplier + jitter,
            );
            item.status = 'pending';
            item.lastError = result.message ?? result.kind;
            await db.outbox.put(item);
            if (result.kind === 'network') {
              await this.refreshCounts();
              return;
            }
            break;
          }
          default: {
            item.status = 'failed';
            item.lastError = `unexpected: ${(result as { kind: string }).kind}`;
            await db.outbox.put(item);
            failedCount++;
          }
        }
      }
    } finally {
      if (processedOk) this._lastSyncAt.set(new Date());
      await this.refreshCounts();
      this._draining.set(false);
      this._syncing.set(false);
      this.broadcast({ type: 'drain:end', processedCount });
      this.telemetry.captureEvent('sync_drain_ended', {
        processedCount,
        failedCount,
        conflictCount,
        durationMs: Math.round(performance.now() - t0),
      });
    }
  }

  // ── Dispatcher por tabla:operación ────────────────────────────────────────

  private async applyOutboxItem(item: OutboxOperation): Promise<ApplyResult> {
    try {
      const key = `${item.table}:${item.operation}`;
      switch (key) {
        case 'parking_sessions:insert':
          return await this.applyInsert(item, 'parking_sessions');
        case 'parking_sessions:update':
          return await this.applyUpdate(item, 'parking_sessions');
        case 'payments:insert':
          return await this.applyInsert(item, 'payments');
        case 'payments:update':
          return await this.applyUpdate(item, 'payments');
        case 'cashier_shifts:insert':
          return await this.applyInsert(item, 'cashier_shifts');
        case 'cashier_shifts:update':
          return await this.applyUpdate(item, 'cashier_shifts');
        case 'cash_withdrawals:insert':
          return await this.applyInsert(item, 'cash_withdrawals');
        default:
          return {
            ok: false,
            kind: '4xx',
            message: `unsupported: ${key}`,
          };
      }
    } catch (e) {
      return { ok: false, kind: 'network', message: String(e) };
    }
  }

  private async applyInsert(
    item: OutboxOperation,
    table: 'parking_sessions' | 'payments' | 'cashier_shifts' | 'cash_withdrawals',
  ): Promise<ApplyResult> {
    const payload: Record<string, unknown> = {
      ...item.payload,
      client_op_id: item.opId,
    };
    delete payload['_sync_status'];

    const { data, error } = await this.supabase.client
      .from(table)
      .insert(payload)
      .select()
      .single();

    if (!error && data) {
      return { ok: true, row: data as Record<string, unknown> };
    }
    if (!error) {
      return { ok: false, kind: '5xx', message: 'insert returned no data' };
    }
    return await this.mapInsertError(error, table, item.opId);
  }

  private async applyUpdate(
    item: OutboxOperation,
    table: 'parking_sessions' | 'payments' | 'cashier_shifts' | 'cash_withdrawals',
  ): Promise<ApplyResult> {
    const rowId = item.rowId;
    if (!rowId) {
      return { ok: false, kind: '4xx', message: 'rowId missing for update' };
    }
    const patch: Record<string, unknown> = {
      ...item.payload,
      updated_at: new Date().toISOString(),
    };
    delete patch['_sync_status'];
    delete patch['client_op_id'];

    const { data, error } = await this.supabase.client
      .from(table)
      .update(patch)
      .eq('id', rowId)
      .select()
      .single();

    if (!error && data) {
      return { ok: true, row: data as Record<string, unknown> };
    }
    if (!error) {
      return { ok: false, kind: '4xx', message: 'update target not found' };
    }
    return this.mapGenericError(error);
  }

  private async mapInsertError(
    error: unknown,
    table: 'parking_sessions' | 'payments' | 'cashier_shifts' | 'cash_withdrawals',
    opId: string,
  ): Promise<ApplyResult> {
    const e = error as {
      code?: string;
      details?: string;
      message?: string;
      status?: number;
    };
    const code = e.code;
    const details = e.details ?? '';
    const message = e.message ?? '';

    if (code === '23505') {
      const hint = `${details} ${message}`.toLowerCase();
      if (hint.includes('client_op_id')) {
        const { data: existing, error: fetchErr } = await this.supabase.client
          .from(table)
          .select('*')
          .eq('client_op_id', opId)
          .maybeSingle();
        if (!fetchErr && existing) {
          return {
            ok: true,
            row: existing as Record<string, unknown>,
            kind: '409_idempotent',
          };
        }
        return {
          ok: false,
          kind: 'network',
          message: 'idempotent row not retrievable yet',
        };
      }
      return { ok: false, kind: '409', message: message || 'unique_violation' };
    }
    return this.mapGenericError(e);
  }

  private mapGenericError(error: unknown): ApplyResult {
    const e = error as {
      code?: string;
      message?: string;
      status?: number;
      details?: string;
    };
    const code = e.code;
    const message = e.message ?? '';
    const status = e.status;
    const lowered = message.toLowerCase();

    // RLS denegado / JWT inválido.
    if (
      code === '42501' ||
      code === 'PGRST301' ||
      status === 401 ||
      status === 403 ||
      lowered.includes('row level security') ||
      lowered.includes('jwt')
    ) {
      return { ok: false, kind: 'unauthorized', message };
    }
    // Sprint 3 — stale-write (P0409 lanzado por aaa_check_stale_write_*).
    // Detectamos por code O por mensaje (PostgREST a veces mapea sin code).
    if (code === 'P0409' || lowered.includes('stale_write')) {
      return { ok: false, kind: '409', message: 'STALE_WRITE' };
    }
    // FK / CHECK / not-null.
    if (code === '23503' || code === '23514' || code === '23502') {
      return { ok: false, kind: '4xx', message };
    }
    if (code === '23505') {
      return { ok: false, kind: '409', message: message || 'unique_violation' };
    }
    if (status === 429) return { ok: false, kind: '429', message };
    if (status != null && status >= 500) {
      return { ok: false, kind: '5xx', message };
    }
    if (status != null && status >= 400) {
      return { ok: false, kind: '4xx', message };
    }
    return { ok: false, kind: 'network', message };
  }

  private async applyMirror(
    item: OutboxOperation,
    serverRow: Record<string, unknown>,
  ): Promise<void> {
    try {
      const db = this.localDb.getDB();
      const tbl = (db as unknown as Record<
        string,
        Dexie.Table<unknown, unknown> | undefined
      >)[item.table];
      if (!tbl) return;
      await tbl.put({ ...serverRow, _sync_status: 'synced' });
    } catch (err) {
      console.warn('[applyMirror] put falló', item.table, err);
    }
  }

  // ── Outbox API ────────────────────────────────────────────────────────────

  async enqueue(op: OutboxOperation): Promise<void> {
    await this.localDb.getDB().outbox.put(op);
    await this.refreshCounts();
    this.broadcast({ type: 'enqueue', table: op.table, opId: op.opId });
    if (this._pendingCount() > SyncOrchestrator.OUTBOX_OVERFLOW_THRESHOLD) {
      this.telemetry.captureWarning('outbox_overflow', {
        pendingCount: this._pendingCount(),
      });
    }
    if (
      this.networkInfo.isOnline() &&
      this.authState.currentUser() != null &&
      !this._draining() &&
      !this._externalDraining
    ) {
      void this.drain();
    }
  }

  /**
   * Resuelve un conflicto del operador.
   *
   * `discard`: borra la operación de outbox y conflicts. Si era INSERT
   *   optimista, también borra la fila del mirror local (el server nunca la
   *   vio). Para UPDATE no podemos revertir el row local sin before-image —
   *   el siguiente snapshotPull/Realtime delta restaurará el server state.
   *
   * `retry`: re-arma el item como pending (attempts=0, sin backoff) y dispara
   *   un drain. Si el item ya no existe (otra pestaña lo procesó) se ignora.
   */
  async resolveConflict(
    opId: string,
    resolution: ConflictResolution,
  ): Promise<void> {
    const db = this.localDb.getDB();
    let resolvedTable: string | undefined;

    await db.transaction('rw', [db.outbox, db.conflicts], async () => {
      const item = await db.outbox.get(opId);
      if (resolution === 'discard') {
        if (item) {
          resolvedTable = item.table;
          if (item.operation === 'insert' && item.rowId) {
            const tbl = (db as unknown as Record<
              string,
              import('dexie').Table<unknown, unknown> | undefined
            >)[item.table];
            if (tbl) {
              try {
                await tbl.delete(item.rowId);
              } catch (err) {
                console.warn(
                  '[resolveConflict] no se pudo borrar row local del mirror',
                  err,
                );
              }
            }
          }
          await db.outbox.delete(opId);
        }
        await db.conflicts.delete(opId);
      } else {
        // retry
        if (!item) {
          await db.conflicts.delete(opId);
          return;
        }
        resolvedTable = item.table;
        item.status = 'pending';
        item.attempts = 0;
        delete item.nextAttemptAt;
        delete item.lastError;
        await db.outbox.put(item);
        await db.conflicts.delete(opId);
      }
    });

    this.telemetry.captureEvent('sync_conflict_resolved', {
      opId,
      resolution,
      table: resolvedTable,
    });
    await this.refreshCounts();
    this.broadcast({ type: 'resolve', opId, resolution });
    if (resolution === 'retry') void this.drain();
  }

  // ── Drain timer ───────────────────────────────────────────────────────────

  private startDrainTimer(): void {
    if (this._drainTimer != null) return;
    this._drainTimer = setInterval(() => {
      if (
        this._pendingCount() > 0 &&
        this.networkInfo.isOnline() &&
        this.authState.currentUser() != null &&
        !this._draining() &&
        !this._externalDraining
      ) {
        void this.drain();
      }
    }, SyncOrchestrator.DRAIN_TICK_MS);
  }

  private stopDrainTimer(): void {
    if (this._drainTimer != null) {
      clearInterval(this._drainTimer);
      delete this._drainTimer;
    }
  }

  private async refreshCounts(): Promise<void> {
    try {
      const db = this.localDb.getDB();
      const pending = await db.outbox.where('status').equals('pending').count();
      const conflicts = await db.conflicts.count();
      this._pendingCount.set(pending);
      this._conflictCount.set(conflicts);
    } catch (err) {
      console.warn('[SyncOrchestrator] refreshCounts falló', err);
    }
  }

  // ── BroadcastChannel multi-pestaña (Sprint 3) ─────────────────────────────

  private initBroadcast(): void {
    if (typeof BroadcastChannel === 'undefined') return; // Safari iOS <15.4
    try {
      this._channel = new BroadcastChannel(SyncOrchestrator.BROADCAST_CHANNEL_NAME);
    } catch (e) {
      console.warn('[sync-orchestrator] BroadcastChannel no disponible', e);
      this._channel = null;
      return;
    }
    this._channel.onmessage = (ev: MessageEvent<SyncBroadcastMsg>) => {
      const msg = ev.data;
      if (!msg || typeof msg !== 'object') return;
      // Ignorar mensajes propios (defensivo: el spec dice que BroadcastChannel
      // no entrega al emisor, pero algunos polyfills sí).
      if ('tabId' in msg && msg.tabId === this._tabId) return;
      this.handleBroadcast(msg);
    };
  }

  private handleBroadcast(msg: SyncBroadcastMsg): void {
    if (msg.type === 'drain:start') {
      this._externalDraining = true;
      this._externalDrainerTabId = msg.tabId;
      if (this._externalDrainTimer) clearTimeout(this._externalDrainTimer);
      this._externalDrainTimer = setTimeout(() => {
        this._externalDraining = false;
        this._externalDrainerTabId = null;
      }, SyncOrchestrator.EXTERNAL_DRAIN_TIMEOUT_MS);
      return;
    }
    if (msg.type === 'drain:end' && msg.tabId === this._externalDrainerTabId) {
      this._externalDraining = false;
      this._externalDrainerTabId = null;
      if (this._externalDrainTimer) clearTimeout(this._externalDrainTimer);
      void this.refreshCounts();
      return;
    }
    if (
      msg.type === 'enqueue' ||
      msg.type === 'conflict' ||
      msg.type === 'resolve'
    ) {
      void this.refreshCounts();
      return;
    }
    if (msg.type === 'logout') {
      this.telemetry.captureWarning('sync_logout_other_tab', { tabId: msg.tabId });
      return;
    }
  }

  /**
   * Publica un evento de sincronización para que las demás pestañas
   * reaccionen (refrescar counts, abstenerse de drenar simultáneamente,
   * etc.). Silencioso si BroadcastChannel no está disponible.
   */
  private broadcast(
    msg:
      | { type: 'drain:start' }
      | { type: 'drain:end'; processedCount: number }
      | { type: 'enqueue'; table: string; opId: string }
      | { type: 'conflict'; opId: string }
      | { type: 'resolve'; opId: string; resolution: ConflictResolution }
      | { type: 'logout' },
  ): void {
    if (!this._channel) return;
    try {
      const enriched = { ...msg, tabId: this._tabId, at: Date.now() } as SyncBroadcastMsg;
      this._channel.postMessage(enriched);
    } catch (e) {
      console.warn('[sync-orchestrator] broadcast falló', e);
    }
  }

  /**
   * Notifica a las demás pestañas que esta sesión cerró. Útil para que
   * detecten el logout y limpien estado local. La pestaña que llama esto
   * NO tumba canales por su cuenta — eso lo hace el effect al ver
   * authState.currentUser() = null.
   */
  notifyLogout(): void {
    this.broadcast({ type: 'logout' });
  }

  private shortId(): string {
    try {
      return crypto.randomUUID().slice(0, 8);
    } catch {
      return Math.random().toString(36).slice(2, 10);
    }
  }

  ngOnDestroy(): void {
    this.teardownRealtimeChannels();
    this.stopDrainTimer();
    this._networkSub?.unsubscribe();
    if (this._externalDrainTimer) clearTimeout(this._externalDrainTimer);
    this._channel?.close();
    this._channel = null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Tipos locales — payload Realtime de Supabase (parcial).
// ──────────────────────────────────────────────────────────────────────────────
interface RealtimePayload {
  eventType?: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}

import type Dexie from 'dexie';
