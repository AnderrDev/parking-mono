import { Column, ColumnType, Schema, Table } from '@powersync/web';

// Mirrors the Supabase tables that must be available offline.
// PowerSync auto-includes the `id TEXT` PK column — do not repeat it.
// Columns not listed here are not synced to local SQLite.

const parkingSessions = new Table({
  name: 'parking_sessions',
  columns: [
    new Column({ name: 'vehicle_plate', type: ColumnType.TEXT }),
    new Column({ name: 'vehicle_type', type: ColumnType.TEXT }),
    new Column({ name: 'entry_at', type: ColumnType.TEXT }),
    new Column({ name: 'exit_at', type: ColumnType.TEXT }),
    new Column({ name: 'status', type: ColumnType.TEXT }),
    new Column({ name: 'tariff_id', type: ColumnType.TEXT }),
    new Column({ name: 'monthly_plan_id', type: ColumnType.TEXT }),
    new Column({ name: 'amount_due_cents', type: ColumnType.INTEGER }),
    new Column({ name: 'entry_user_id', type: ColumnType.TEXT }),
    new Column({ name: 'exit_user_id', type: ColumnType.TEXT }),
    new Column({ name: 'color', type: ColumnType.TEXT }),
    new Column({ name: 'brand', type: ColumnType.TEXT }),
    new Column({ name: '_sync_status', type: ColumnType.TEXT }),
    new Column({ name: 'created_at', type: ColumnType.TEXT }),
    new Column({ name: 'updated_at', type: ColumnType.TEXT }),
  ],
});

const tariffs = new Table({
  name: 'tariffs',
  columns: [
    new Column({ name: 'name', type: ColumnType.TEXT }),
    new Column({ name: 'vehicle_type', type: ColumnType.TEXT }),
    new Column({ name: 'unit', type: ColumnType.TEXT }),
    new Column({ name: 'value_cents', type: ColumnType.INTEGER }),
    new Column({ name: 'grace_minutes', type: ColumnType.INTEGER }),
    new Column({ name: 'daily_cap_cents', type: ColumnType.INTEGER }),
    new Column({ name: 'is_active', type: ColumnType.INTEGER }),
    new Column({ name: 'schedule_json', type: ColumnType.TEXT }),
    new Column({ name: 'valid_from', type: ColumnType.TEXT }),
    new Column({ name: 'valid_to', type: ColumnType.TEXT }),
    new Column({ name: '_deleted', type: ColumnType.INTEGER }),
    new Column({ name: 'created_at', type: ColumnType.TEXT }),
    new Column({ name: 'updated_at', type: ColumnType.TEXT }),
  ],
});

const monthlyPlans = new Table({
  name: 'monthly_plans',
  columns: [
    new Column({ name: 'customer_id', type: ColumnType.TEXT }),
    new Column({ name: 'vehicle_plate', type: ColumnType.TEXT }),
    new Column({ name: 'plan_type', type: ColumnType.TEXT }),
    new Column({ name: 'start_date', type: ColumnType.TEXT }),
    new Column({ name: 'end_date', type: ColumnType.TEXT }),
    new Column({ name: 'amount_cents', type: ColumnType.INTEGER }),
    new Column({ name: 'status', type: ColumnType.TEXT }),
    new Column({ name: 'auto_renew', type: ColumnType.INTEGER }),
    new Column({ name: '_deleted', type: ColumnType.INTEGER }),
    new Column({ name: 'created_at', type: ColumnType.TEXT }),
    new Column({ name: 'updated_at', type: ColumnType.TEXT }),
  ],
});

const cashierShifts = new Table({
  name: 'cashier_shifts',
  columns: [
    new Column({ name: 'user_id', type: ColumnType.TEXT }),
    new Column({ name: 'opened_at', type: ColumnType.TEXT }),
    new Column({ name: 'closed_at', type: ColumnType.TEXT }),
    new Column({ name: 'opening_balance_cents', type: ColumnType.INTEGER }),
    new Column({ name: 'closing_balance_cents', type: ColumnType.INTEGER }),
    new Column({ name: 'expected_balance_cents', type: ColumnType.INTEGER }),
    new Column({ name: 'difference_cents', type: ColumnType.INTEGER }),
    new Column({ name: 'justification', type: ColumnType.TEXT }),
    new Column({ name: 'status', type: ColumnType.TEXT }),
    new Column({ name: '_deleted', type: ColumnType.INTEGER }),
    new Column({ name: 'created_at', type: ColumnType.TEXT }),
    new Column({ name: 'updated_at', type: ColumnType.TEXT }),
  ],
});

const payments = new Table({
  name: 'payments',
  columns: [
    new Column({ name: 'invoice_id', type: ColumnType.TEXT }),
    new Column({ name: 'session_id', type: ColumnType.TEXT }),
    new Column({ name: 'method', type: ColumnType.TEXT }),
    new Column({ name: 'amount_cents', type: ColumnType.INTEGER }),
    new Column({ name: 'status', type: ColumnType.TEXT }),
    new Column({ name: 'paid_at', type: ColumnType.TEXT }),
    new Column({ name: 'cashier_shift_id', type: ColumnType.TEXT }),
    new Column({ name: '_deleted', type: ColumnType.INTEGER }),
    new Column({ name: '_sync_status', type: ColumnType.TEXT }),
    new Column({ name: 'created_at', type: ColumnType.TEXT }),
    new Column({ name: 'updated_at', type: ColumnType.TEXT }),
  ],
});

const customers = new Table({
  name: 'customers',
  columns: [
    new Column({ name: 'doc_type', type: ColumnType.TEXT }),
    new Column({ name: 'doc_number', type: ColumnType.TEXT }),
    new Column({ name: 'dv', type: ColumnType.INTEGER }),
    new Column({ name: 'name', type: ColumnType.TEXT }),
    new Column({ name: 'email', type: ColumnType.TEXT }),
    new Column({ name: 'phone', type: ColumnType.TEXT }),
    new Column({ name: 'address', type: ColumnType.TEXT }),
    new Column({ name: 'municipio', type: ColumnType.TEXT }),
    new Column({ name: 'departamento', type: ColumnType.TEXT }),
    new Column({ name: '_deleted', type: ColumnType.INTEGER }),
    new Column({ name: 'created_at', type: ColumnType.TEXT }),
    new Column({ name: 'updated_at', type: ColumnType.TEXT }),
  ],
});

const vehicles = new Table({
  name: 'vehicles',
  columns: [
    new Column({ name: 'plate', type: ColumnType.TEXT }),
    new Column({ name: 'type', type: ColumnType.TEXT }),
    new Column({ name: 'color', type: ColumnType.TEXT }),
    new Column({ name: 'brand', type: ColumnType.TEXT }),
    new Column({ name: 'owner_customer_id', type: ColumnType.TEXT }),
    new Column({ name: '_deleted', type: ColumnType.INTEGER }),
    new Column({ name: 'created_at', type: ColumnType.TEXT }),
    new Column({ name: 'updated_at', type: ColumnType.TEXT }),
  ],
});

export const PARQUEADERO_SCHEMA = new Schema([
  parkingSessions,
  tariffs,
  monthlyPlans,
  cashierShifts,
  payments,
  customers,
  vehicles,
]);
