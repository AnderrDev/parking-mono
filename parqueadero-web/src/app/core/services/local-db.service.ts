import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';

// ──────────────────────────────────────────────────────────────────────────────
// Modelos del mirror (DTO crudo en snake_case del backend).
// En Sprint 0 los tipos son laxos. En Sprints 1+ se reemplazarán por imports
// desde features/.../data/models/ a medida que se rellene el mirror.
// ──────────────────────────────────────────────────────────────────────────────
export interface TariffModel {
  id: string;
  vehicle_type: string;
  is_active: number;
  [k: string]: unknown;
}
export interface MonthlyPlanModel {
  id: string;
  vehicle_plate: string;
  status: string;
  end_date: string;
  [k: string]: unknown;
}
export interface CustomerModel {
  id: string;
  doc_number: string;
  email?: string;
  updated_at: string;
  [k: string]: unknown;
}
export interface VehicleModel {
  id: string;
  plate: string;
  owner_customer_id?: string;
  updated_at: string;
  [k: string]: unknown;
}
export interface AppSettingModel {
  key: string;
  value: unknown;
}
export interface ParkingSessionModel {
  id: string;
  vehicle_plate: string;
  status: string;
  entry_user_id: string;
  entry_at: string;
  client_op_id?: string | null;
  _sync_status?: string;
  [k: string]: unknown;
}
export interface PaymentModel {
  id: string;
  cashier_shift_id: string;
  paid_at: string;
  status: string;
  client_op_id?: string | null;
  _sync_status?: string;
  [k: string]: unknown;
}
export interface CashierShiftModel {
  id: string;
  user_id: string;
  status: string;
  client_op_id?: string | null;
  _sync_status?: string;
  [k: string]: unknown;
}
// Sprint 2 (parte B) — cash_withdrawals añadida en Dexie v2 para que
// CashierLocalDataSource.registerWithdrawal pueda persistir offline y
// applyMirror del orchestrator no descarte el row tras el drain.
export interface CashWithdrawalModel {
  id: string;
  shift_id: string;
  user_id: string;
  amount_cents: number;
  recipient: string;
  justification: string;
  movement_type?: 'in' | 'out';
  withdrawn_at: string;
  client_op_id?: string | null;
  _sync_status?: string;
  [k: string]: unknown;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tipos de outbox & conflicts (ver offline-local-db.spec.md y outbox-drain.spec.md).
// ──────────────────────────────────────────────────────────────────────────────
export type OutboxTable =
  | 'parking_sessions'
  | 'payments'
  | 'cashier_shifts'
  | 'cash_withdrawals';
export type OutboxOperationType = 'insert' | 'update' | 'delete';
export type OutboxStatus = 'pending' | 'in_flight' | 'conflict' | 'failed';

export interface OutboxOperation {
  opId: string;
  table: OutboxTable;
  operation: OutboxOperationType;
  payload: Record<string, unknown>;
  rowId?: string;
  enqueuedAt: Date;
  attempts: number;
  lastAttemptAt?: Date;
  nextAttemptAt?: Date;
  status: OutboxStatus;
  lastError?: string;
}

export interface SyncConflict {
  opId: string;
  table: string;
  localPayload: Record<string, unknown>;
  serverPayload?: Record<string, unknown>;
  detectedAt: Date;
  reason: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Definición de la base Dexie. Una sola por dispositivo+origin.
// Cualquier cambio de schema obliga a una nueva `this.version(N)` MANTENIENDO
// la `version(1)` previa (regla Dexie de migraciones).
// ──────────────────────────────────────────────────────────────────────────────
export class ParqueaderoLocalDB extends Dexie {
  // Mirror tables (lectura cacheada de Supabase)
  tariffs!: Table<TariffModel, string>;
  monthly_plans!: Table<MonthlyPlanModel, string>;
  customers!: Table<CustomerModel, string>;
  vehicles!: Table<VehicleModel, string>;
  app_settings!: Table<AppSettingModel, string>;
  parking_sessions!: Table<ParkingSessionModel, string>;
  payments!: Table<PaymentModel, string>;
  cashier_shifts!: Table<CashierShiftModel, string>;
  cash_withdrawals!: Table<CashWithdrawalModel, string>;

  // Outbox & conflicts
  outbox!: Table<OutboxOperation, string>;
  conflicts!: Table<SyncConflict, string>;

  constructor() {
    super('parqueadero-local-db');
    // v1 — Sprint 0/1: catálogos + mirror operativo read-only.
    // MANTENER intacta (regla Dexie de migraciones aditivas).
    this.version(1).stores({
      tariffs: 'id, vehicle_type, is_active, [vehicle_type+is_active]',
      monthly_plans: 'id, vehicle_plate, status, end_date, [status+end_date]',
      customers: 'id, doc_number, email, updated_at',
      vehicles: 'id, plate, owner_customer_id, updated_at',
      app_settings: 'key',
      parking_sessions:
        'id, vehicle_plate, status, entry_user_id, [entry_user_id+status], entry_at',
      payments: 'id, cashier_shift_id, paid_at, status',
      cashier_shifts: 'id, user_id, status, [user_id+status]',
      outbox: 'opId, status, enqueuedAt, [status+enqueuedAt]',
      conflicts: 'opId, table, detectedAt',
    });
    // v2 — Sprint 2 (parte B): añade cash_withdrawals como tabla del mirror.
    // Mantiene el resto de stores idénticos a v1 (Dexie requiere repetir el
    // schema completo al declarar una nueva versión aditiva).
    this.version(2).stores({
      tariffs: 'id, vehicle_type, is_active, [vehicle_type+is_active]',
      monthly_plans: 'id, vehicle_plate, status, end_date, [status+end_date]',
      customers: 'id, doc_number, email, updated_at',
      vehicles: 'id, plate, owner_customer_id, updated_at',
      app_settings: 'key',
      parking_sessions:
        'id, vehicle_plate, status, entry_user_id, [entry_user_id+status], entry_at',
      payments: 'id, cashier_shift_id, paid_at, status',
      cashier_shifts: 'id, user_id, status, [user_id+status]',
      cash_withdrawals:
        'id, shift_id, user_id, withdrawn_at, [shift_id+withdrawn_at]',
      outbox: 'opId, status, enqueuedAt, [status+enqueuedAt]',
      conflicts: 'opId, table, detectedAt',
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Servicio singleton que encapsula la base Dexie.
// La base se abre lazy al primer acceso (Dexie maneja el open() interno).
// ──────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class LocalDbService {
  private readonly _db = new ParqueaderoLocalDB();

  /** Devuelve la instancia Dexie. Lazy (se abre al primer acceso). */
  getDB(): ParqueaderoLocalDB {
    return this._db;
  }

  /**
   * Borra todas las tablas (mirror + outbox + conflicts).
   * Se invoca al logout para evitar fuga de datos entre operadores.
   */
  async clear(): Promise<void> {
    await this._db.transaction('rw', this._db.tables, async () => {
      for (const t of this._db.tables) {
        await t.clear();
      }
    });
  }
}
