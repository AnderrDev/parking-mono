# Spec: Offline Local DB (Dexie schema v1)

## Propósito

Definir el schema de IndexedDB (vía Dexie.js) que sirve como mirror de
catálogos y como outbox de mutaciones pendientes para el operador. Esta
spec es la fuente de verdad de la versión 1 del schema; cualquier cambio
de columnas o índices exige una nueva migración Dexie con `db.version(N)`.

## Ámbito

Una base por dispositivo+origin, nombre `parqueadero-local-db`. Compartida
por todas las pestañas del mismo origin (regla operativa: 1 pestaña por
operador).

## Versión 1 — Tablas

### Mirror (read-cache de Supabase)

| Tabla              | Primary key | Índices secundarios                                                         |
|--------------------|-------------|-----------------------------------------------------------------------------|
| `tariffs`          | `id`        | `vehicle_type`, `is_active`, `[vehicle_type+is_active]`                     |
| `monthly_plans`    | `id`        | `vehicle_plate`, `status`, `end_date`, `[status+end_date]`                  |
| `customers`        | `id`        | `doc_number`, `email`, `updated_at`                                         |
| `vehicles`         | `id`        | `plate`, `owner_customer_id`, `updated_at`                                  |
| `app_settings`     | `key`       | —                                                                           |
| `parking_sessions` | `id`        | `vehicle_plate`, `status`, `entry_user_id`, `[entry_user_id+status]`, `entry_at` |
| `payments`         | `id`        | `cashier_shift_id`, `paid_at`, `status`                                     |
| `cashier_shifts`   | `id`        | `user_id`, `status`, `[user_id+status]`                                     |

Los campos siguen el snake_case del backend (DTO crudo). Dexie no fuerza
tipo: el TypeScript de cada tabla es `XxxModel`.

### Outbox (mutaciones pendientes)

| Tabla        | Primary key | Índices secundarios                          |
|--------------|-------------|----------------------------------------------|
| `outbox`     | `opId`      | `status`, `enqueuedAt`, `[status+enqueuedAt]`|

Forma de un row `outbox`:

```typescript
interface OutboxOperation {
  opId: string;              // UUID v4 — clave de idempotencia
  table: 'parking_sessions' | 'payments' | 'cashier_shifts' | 'cash_withdrawals';
  operation: 'insert' | 'update' | 'delete';
  payload: Record<string, unknown>;  // snake_case DTO
  rowId?: string;            // PK del row remoto (necesario para update/delete)
  enqueuedAt: Date;
  attempts: number;          // contador para backoff
  lastAttemptAt?: Date;
  nextAttemptAt?: Date;      // schedule del próximo intento
  status: 'pending' | 'in_flight' | 'conflict' | 'failed';
  lastError?: string;        // mensaje del último fallo
}
```

### Conflicts (cola de revisión manual)

| Tabla        | Primary key | Índices secundarios                          |
|--------------|-------------|----------------------------------------------|
| `conflicts`  | `opId`      | `table`, `detectedAt`                         |

Forma:

```typescript
interface SyncConflict {
  opId: string;              // mismo opId que el outbox
  table: string;
  localPayload: Record<string, unknown>;
  serverPayload?: Record<string, unknown>;  // versión remota si la trae el 409
  detectedAt: Date;
  reason: string;
}
```

## Schema TypeScript (inline en `local-db.service.ts`)

```typescript
import Dexie, { Table } from 'dexie';

export class ParqueaderoLocalDB extends Dexie {
  // Mirror
  tariffs!: Table<TariffModel, string>;
  monthly_plans!: Table<MonthlyPlanModel, string>;
  customers!: Table<CustomerModel, string>;
  vehicles!: Table<VehicleModel, string>;
  app_settings!: Table<AppSettingModel, string>;
  parking_sessions!: Table<ParkingSessionModel, string>;
  payments!: Table<PaymentModel, string>;
  cashier_shifts!: Table<CashierShiftModel, string>;

  // Outbox & conflicts
  outbox!: Table<OutboxOperation, string>;
  conflicts!: Table<SyncConflict, string>;

  constructor() {
    super('parqueadero-local-db');
    this.version(1).stores({
      tariffs:          'id, vehicle_type, is_active, [vehicle_type+is_active]',
      monthly_plans:    'id, vehicle_plate, status, end_date, [status+end_date]',
      customers:        'id, doc_number, email, updated_at',
      vehicles:         'id, plate, owner_customer_id, updated_at',
      app_settings:     'key',
      parking_sessions: 'id, vehicle_plate, status, entry_user_id, [entry_user_id+status], entry_at',
      payments:         'id, cashier_shift_id, paid_at, status',
      cashier_shifts:   'id, user_id, status, [user_id+status]',
      outbox:           'opId, status, enqueuedAt, [status+enqueuedAt]',
      conflicts:        'opId, table, detectedAt',
    });
  }
}
```

NOTA Dexie: `is_active` (boolean) NO se puede usar directamente como
índice en Dexie (Dexie indexa con IndexedDB y los booleanos no son
indexables). En Sprint 1 cuando se rellene el mirror se persistirá como
`0|1`. En Sprint 0 basta con declarar el índice; queda sin filas.

## Políticas de retención

| Tabla              | Política                                                              | Cuándo se aplica                |
|--------------------|-----------------------------------------------------------------------|---------------------------------|
| `tariffs`          | siempre completa                                                      | snapshot pull                   |
| `monthly_plans`    | solo `active` y `expiring`                                            | snapshot pull                   |
| `customers`        | últimos 90 días por `updated_at`                                      | snapshot pull + truncado mensual|
| `vehicles`         | últimos 90 días por `updated_at`                                      | snapshot pull + truncado mensual|
| `app_settings`     | todas las keys                                                        | snapshot pull                   |
| `parking_sessions` | sesiones del operador del día actual + activas                        | snapshot pull diario            |
| `payments`         | pagos del turno actual                                                | al abrir turno                  |
| `cashier_shifts`   | turno abierto del operador (1 row máx)                                | al abrir turno                  |
| `outbox`           | rows `pending` o `in_flight` o `conflict` — se borra row al `synced`   | drain                           |
| `conflicts`        | hasta resolución manual                                               | manual                          |

En Sprint 0 NO se implementa retención. Solo se documenta.

## Vida útil

- `LocalDbService.clear()` borra todas las tablas (mirror + outbox + conflicts).
  Se llama en logout.
- Una migración a versión 2 del schema requiere ` this.version(2).stores({...})`
  manteniendo el `version(1)` previo (regla Dexie).

## Manejo de errores

| Caso                                       | Acción                                                            |
|--------------------------------------------|-------------------------------------------------------------------|
| Browser sin soporte IndexedDB              | `getDB()` rechaza; orquestador queda en modo online-only          |
| `QuotaExceededError`                        | Truncar `customers`/`vehicles` < 30 días y reintentar             |
| Versión persistida > versión del código    | Refresh forzado (Dexie ya lanza `VersionError`) y aviso al usuario|

## Consideraciones de seguridad

- IndexedDB es accesible desde DevTools del navegador. Datos sensibles
  (placas, clientes) deben borrarse al logout.
- No persistir tokens ni payloads JWT en Dexie.
- Multi-cuenta en el mismo dispositivo: el `clear()` en logout previene
  fuga entre usuarios; aun así, si dos operadores diferentes usan la misma
  estación, el segundo verá la base vacía hasta su propio snapshot.

## Decisiones cerradas

1. Una única base llamada `parqueadero-local-db`.
2. Nombres de tablas en snake_case (alineados al backend).
3. PK siempre `id` (UUID generado en cliente al crear offline) salvo
   `app_settings.key` y `outbox.opId`.
4. Outbox usa `opId` separado del `id` del row para soportar inserts
   donde el `id` se autogenera client-side y se conserva al sincronizar.
