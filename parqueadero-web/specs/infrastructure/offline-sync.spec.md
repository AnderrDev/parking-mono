# Spec: Offline Sync Infrastructure (operador-only)

## Propósito

Permitir que el rol **operador** opere el parqueadero (entrada, salida, pago,
turno) sin conexión a internet durante el turno, manteniendo consistencia
eventual con Supabase cuando vuelva la red. La sincronización es **100% local**,
sin servidor de sincronización externo (no PowerSync, no Hasura, no Replicache):
combina un *mirror* de lectura en IndexedDB (vía Dexie.js) con una *outbox*
FIFO de mutaciones pendientes drenada por un orquestador.

Admin, contador y reportes NO operan offline (Fase 8 fuera de alcance).
Facturación electrónica DIAN/Siigo NO se toca en Fase 8.

## Alcance funcional offline

Operaciones que DEBEN funcionar sin red:

- Registrar entrada (`parking_sessions` insert)
- Registrar salida (`parking_sessions` update + `payments` insert)
- Consultar sesiones activas del día (lectura local)
- Consultar tarifa/plan mensual/cliente/vehículo (lectura local de catálogo)
- Abrir/cerrar turno (`cashier_shifts` insert/update)
- Registrar retiro de efectivo (`cash_withdrawals` insert) — opcional Fase 8
- Imprimir ticket/recibo (renderer local, sin red)

Operaciones que NO funcionan offline (degradan UX a banner):

- Cualquier acceso de admin (catálogos, configuración, usuarios)
- Reportes y exportes
- Solicitar factura electrónica (Siigo)

## Componentes

1. **LocalDbService** (`core/services/local-db.service.ts`)
   Wrapper Dexie. Define el schema v1 (ver `offline-local-db.spec.md`).
   Expone `getDB()` y `clear()`.

2. **SyncOrchestrator** (`core/services/sync-orchestrator.service.ts`)
   Coordina el ciclo de vida offline. Signals públicos:
   - `pendingCount: Signal<number>` — número de mutaciones en outbox
   - `conflictCount: Signal<number>` — número de items en estado `conflict`
   - `syncing: Signal<boolean>` — `true` mientras hay drain/snapshot en curso
   - `lastSyncAt: Signal<Date | null>` — timestamp del último drain exitoso
   Métodos: `initialize()`, `snapshotPull()`, `drain()`, `enqueue(op)`,
   `resolveConflict(id, resolution)`.

3. **Mirror tables** (Dexie): copia local de catálogos críticos para lectura.
   Se mantiene fresca por:
   - *Snapshot pull* al boot (operador autenticado) y al recuperar conexión.
   - *Realtime subscription* (Supabase channels) para deltas mientras el
     tab está vivo.

4. **Outbox** (Dexie): cola FIFO de mutaciones pendientes con `_op_id`
   (UUID v4 generado en cliente como clave de idempotencia).

5. **OfflineBannerComponent** (`shared/components/offline-banner`):
   consume signals del orquestador y muestra estado al usuario.

## Política de conflictos

- **Server-wins por defecto** (último escritor remoto gana). El drain
  envía la mutación; si el servidor responde 409, el item pasa a estado
  `conflict` y se incrementa `conflictCount`.
- El operador resuelve manualmente desde el banner rojo (UI a definir en
  sprints siguientes). En Sprint 0 solo se expone el contador y el método
  stub `resolveConflict()`.
- NO hay merge automático. NO hay last-write-wins por timestamp.

## Tablas sincronizadas

| Tabla              | Dirección | Filtro local                                              | Política       |
|--------------------|-----------|-----------------------------------------------------------|----------------|
| `tariffs`          | read-only | `is_active = true AND _deleted = false`                   | mirror         |
| `monthly_plans`    | read-only | `status IN ('active','expiring') AND _deleted = false`    | mirror         |
| `customers`        | read-only | últimos 90 días por `updated_at`                          | mirror         |
| `vehicles`         | read-only | últimos 90 días por `updated_at`                          | mirror         |
| `app_settings`     | read-only | todas las keys                                            | mirror         |
| `parking_sessions` | bidir.    | sesiones del operador, día actual (`entry_user_id=me`)    | mirror + outbox |
| `payments`         | bidir.    | pagos del turno actual del operador                       | mirror + outbox |
| `cashier_shifts`   | bidir.    | turno abierto del operador                                | mirror + outbox |

`invoices` y `invoice_lines` quedan **fuera** del alcance offline.

## Interfaz pública

```typescript
// LocalDbService
class LocalDbService {
  getDB(): ParqueaderoLocalDB;
  clear(): Promise<void>;
}

// SyncOrchestrator
class SyncOrchestrator {
  readonly pendingCount: Signal<number>;
  readonly conflictCount: Signal<number>;
  readonly syncing: Signal<boolean>;
  readonly lastSyncAt: Signal<Date | null>;

  initialize(): Promise<void>;
  snapshotPull(): Promise<void>;
  drain(): Promise<void>;
  enqueue(op: OutboxOperation): Promise<void>;
  resolveConflict(opId: string, resolution: 'discard' | 'retry'): Promise<void>;
}
```

## Configuración

- No usa variables de entorno nuevas en Sprint 0.
- Nombre de base Dexie: `parqueadero-local-db`. Versión inicial: `1`.
- Activación: `SyncOrchestrator.initialize()` se invoca en `APP_INITIALIZER`
  pero queda en estado *armado*. El primer `snapshotPull()` real corre cuando
  hay sesión Supabase activa (Sprint 1).

## Flujos

### F1. Arranque de la app
```
1. APP_INITIALIZER → SyncOrchestrator.initialize()
2. initialize() abre Dexie (LocalDbService.getDB()).
3. initialize() suscribe a NetworkInfoService.isOnline$.
4. initialize() actualiza pendingCount/conflictCount leyendo la outbox.
5. (Sprint 1+) Si hay sesión Supabase activa → snapshotPull() + Realtime sub.
```

### F2. Mutación offline (Sprint 1+, no se implementa en Sprint 0)
```
1. UseCase llama repository.registerEntry()
2. Repository pregunta isOnline:
   - online → POST a Supabase; si OK actualiza mirror.
   - offline → escribe en mirror local + SyncOrchestrator.enqueue(op).
3. UI refleja el cambio leyendo el mirror local.
4. Banner muestra pendingCount > 0.
```

### F3. Recuperación de conexión (Sprint 1+)
```
1. NetworkInfoService.isOnline$ emite true.
2. SyncOrchestrator detecta transición offline→online.
3. drain() ejecuta outbox FIFO.
4. snapshotPull() refresca mirror.
5. pendingCount llega a 0; lastSyncAt se actualiza.
```

### F4. Logout
```
1. AuthRepositoryImpl.logout() llama localDb.clear() ANTES del signOut.
2. localDb.clear() borra todas las tablas (mirror + outbox).
3. Supabase signOut + AuthStateService.clear().
```

## Manejo de errores

| Caso                                     | Acción                                                 |
|------------------------------------------|--------------------------------------------------------|
| IndexedDB no disponible (modo privado)   | Log + degradación a modo online-only (no bloquear app) |
| Cuota IndexedDB excedida                 | Truncar mirror por antigüedad (`vehicles`/`customers` < 30d) |
| Drain falla por 5xx                      | Backoff exponencial (ver `outbox-drain.spec.md`)       |
| Drain falla por 4xx no-409               | Marcar item `failed`, requerir intervención manual     |
| Drain devuelve 409 (conflicto)           | Item → `conflict`, incrementa contador                 |
| Realtime channel se cae                  | Reintentar suscripción con backoff; mirror queda stale hasta snapshot |

## Consideraciones de seguridad

- IndexedDB contiene datos sensibles (placas, montos, clientes). Al logout
  se borra todo (`LocalDbService.clear()`).
- RLS de Supabase sigue siendo la barrera de autoridad: el snapshot solo
  trae lo que el JWT del operador puede leer.
- No se guardan tokens ni JWT en Dexie. La sesión sigue en localStorage
  manejada por `@supabase/supabase-js`.
- Auditoría: las mutaciones offline al sincronizar disparan los triggers
  `write_audit_log` del backend con el `entry_user_id`/`user_id` original.

## Ejemplos

### Ejemplo 1: operador registra entrada offline
```typescript
// Sprint 1+
const op: OutboxOperation = {
  opId: crypto.randomUUID(),
  table: 'parking_sessions',
  operation: 'insert',
  payload: { id, vehicle_plate, entry_at, entry_user_id, status: 'active' },
  enqueuedAt: new Date(),
  attempts: 0,
  status: 'pending',
};
await syncOrchestrator.enqueue(op);
// banner muestra "1 pendiente"
```

### Ejemplo 2: lectura de tarifa offline
```typescript
// Sprint 1+
const tariff = await localDb.getDB().tariffs
  .where({ vehicle_type: 'carro', is_active: 1 })
  .first();
```

## Relación con otras specs

- `offline-local-db.spec.md` — schema Dexie detallado.
- `outbox-drain.spec.md` — algoritmo de drain y backoff.
- Specs de UseCase (parking, cashier, payments) — añadirán lógica
  offline-aware en sprints posteriores.

## Decisiones cerradas (no re-debatir)

1. Stack: Dexie.js, sin servidor de sync externo.
2. Alcance: operador-only. Admin/reportes/Siigo fuera.
3. Conflictos: server-wins, escalación manual.
4. Concurrencia: 1 operador = 1 pestaña. Multi-tab fuera de Sprint 0.
5. `ngsw-config.json` queda sin `dataGroups` (Dexie reemplaza el HTTP cache).

---
Status: Sprint 0 — esqueleto implementado, lógica de drain/mirror diferida a Sprints 1-3.
