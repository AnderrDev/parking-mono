# Sesión: Cierre Fase 8 — Offline operador-only

**Fecha:** 2026-05-15
**Subproyecto(s):** parqueadero-web + parqueadero-backend
**Estado:** completada
**Sprints:** 4 (Sprint 0 fundación, Sprint 1 mirror read, Sprint 2 outbox writes, Sprint 3 conflicts+hardening)

## Objetivos
- [x] Operador opera flujo crítico (entrada/salida/pago/turno) sin red.
- [x] Lecturas offline desde mirror Dexie con Realtime para mantenerlo fresco.
- [x] Escrituras optimistas con outbox FIFO drenada al reconectar.
- [x] Idempotencia server-side por `client_op_id`.
- [x] UI para resolver conflictos manuales.
- [x] Coordinación multi-tab con `BroadcastChannel`.
- [x] Stale-write protection server-side.
- [x] Logout protege outbox pendiente.

## Decisiones cerradas (no re-debatir)
- Stack: 100 % local (Dexie + outbox propio + Supabase Realtime). **NO PowerSync** — el SDK quedó descartado por costo/complejidad para 1 operador concurrente.
- Alcance: **operador-only**. Admin, reportes y Siigo FE quedan fuera de Fase 8 (siguen requiriendo red).
- 1 operador = 1 pestaña. Multi-tab tolerado vía `BroadcastChannel` pero no soportado oficialmente (la doc lo advierte).
- **Server-wins** en conflictos automáticos; escalación manual al operador cuando la regla de negocio no decide sola (constraints como `uq_sessions_active`).
- **FIFO global** por `enqueuedAt` para preservar orden temporal de operaciones del mismo operador.
- Idempotencia siempre desde cliente: `client_op_id` UUID v4 generado en el momento del enqueue.

## Avance (resumen por sprint)
- **Sprint 0** — Fundación Dexie. 3 specs (`offline-sync`, `offline-local-db`, `outbox-drain`), `LocalDbService` con Dexie v1 (10 stores), `SyncOrchestrator` esqueleto, `OfflineBanner` refactorizado con `pendingCount`/`conflictsCount`, `auth.repository.impl.clear()` para limpiar mirror en logout, `ngsw-config.json` sin `dataGroups` (PowerSync removido).
- **Sprint 1** — Mirror read. Segundo `APP_INITIALIZER` para arrancar orchestrator, migration `00019_realtime_offline_mirror.sql` (publication para 5 catálogos), `snapshotPull()` real (5 tablas en paralelo, page size 500), Realtime con backoff exp 1s→30s, 5 `LocalDataSource` read-only (`tariffs`, `monthly_plans`, `customers`, `vehicles`, `app_settings`), 5 `Repository` impls cache-aware (lee local si offline, remoto si online + refresca mirror).
- **Sprint 2** — Outbox writes. Migration `00020_outbox_idempotency.sql` (`client_op_id UUID UNIQUE WHERE client_op_id IS NOT NULL` en `parking_sessions`, `payments`, `cashier_shifts`, `cash_withdrawals` + columna `_sync_status`). `drain()` real con FIFO global, backoff exponencial, cap 10 reintentos, idempotencia por `client_op_id`. `snapshotPull` extendido con 3 helpers operador (sesiones activas del día, payments del día, turno abierto). Dexie bumpeado a v2 con tabla `cash_withdrawals`. 3 `LocalDataSource` mutables (`parking`, `payments`, `cashier`). 3 `Repository` impls con write-through optimista (escritura local inmediata + push remoto o enqueue si offline).
- **Sprint 3** — Conflicts + hardening. Migration `00021_stale_write_protection.sql` (trigger `check_stale_write` que raise `P0409` si `updated_at` server > `updated_at` cliente). `BroadcastChannel('parqueadero-offline-sync')` multi-tab con eventos `enqueue`, `drain-start`, `drain-end`, `clear`. `resolveConflict(id, strategy)` real con 4 estrategias (`server-wins`, `retry-now`, `discard-local`, `manual-edit`). Dialog `conflicts-dialog.component` con payload local vs server lado a lado. Logout con `confirm-dialog` bloqueante si `pendingCount > 0`. Telemetría con 7 eventos (`sync_attempted`, `sync_succeeded`, `sync_failed`, `conflict_detected`, `conflict_resolved`, `mirror_pulled`, `realtime_reconnected`). Refund offline encolado como op `refund_payment`.

## Migrations backend nuevas
- `00019_realtime_offline_mirror.sql` — `ALTER PUBLICATION supabase_realtime ADD TABLE` para `tariffs`, `monthly_plans`, `customers`, `vehicles`, `app_settings`.
- `00020_outbox_idempotency.sql` — `client_op_id UUID` + `UNIQUE INDEX WHERE client_op_id IS NOT NULL` y columna `_sync_status TEXT DEFAULT 'synced'` en las 4 tablas mutables.
- `00021_stale_write_protection.sql` — trigger `check_stale_write()` (BEFORE UPDATE) que compara `OLD.updated_at` con el `_client_updated_at` que envía el cliente; raise `P0409` con mensaje JSON si el server ya cambió.

## Archivos nuevos / mayores cambios (resumen)
- `parqueadero-web/src/app/core/services/local-db.service.ts` (Dexie v2, 10 stores).
- `parqueadero-web/src/app/core/services/sync-orchestrator.service.ts` (snapshotPull + drain + Realtime + BroadcastChannel + telemetría).
- `parqueadero-web/src/app/core/services/sync-telemetry.service.ts` (7 events, ring-buffer 200 entradas).
- `parqueadero-web/src/app/features/parking/data/datasources/parking-local.datasource.ts` (mutable; antes era placeholder).
- `parqueadero-web/src/app/features/parking/data/repositories/parking.repository.impl.ts` (write-through optimista).
- `parqueadero-web/src/app/features/cashier/data/datasources/cashier-local.datasource.ts` (mutable, incluye `cash_withdrawals`).
- `parqueadero-web/src/app/features/cashier/data/repositories/cashier.repository.impl.ts` (write-through).
- `parqueadero-web/src/app/features/payments/data/{datasources,repositories}/*` (write-through + refund offline).
- `parqueadero-web/src/app/features/tariffs|monthly-plans|customers|vehicles|settings/data/...` (5 LocalDataSources read-only + repository cache-aware).
- `parqueadero-web/src/app/shared/components/offline-banner/*` (refactor con pendingCount, conflictsCount, 3 estados visuales).
- `parqueadero-web/src/app/shared/components/conflicts-dialog/*` (nuevo, CDK Dialog con payload lado a lado).
- `parqueadero-web/src/app/features/auth/data/repositories/auth.repository.impl.ts` (`clear()` invocado en logout).
- `parqueadero-web/src/app/app.config.ts` (segundo `APP_INITIALIZER` para orchestrator).
- `parqueadero-web/ngsw-config.json` (sin `dataGroups`, solo `assetGroups` para shell).
- `parqueadero-backend/supabase/migrations/0001{9,20,21}_*.sql`.

## Comportamiento offline
- **5 tablas read-only** en mirror: `tariffs`, `monthly_plans`, `customers` (últimos 90 días por `last_seen_at`), `vehicles` (últimos 90 días), `app_settings`.
- **4 tablas read+write** en mirror: `parking_sessions`, `payments`, `cashier_shifts`, `cash_withdrawals`.
- **Outbox FIFO** con backoff exp `1s → 2s → 4s → 8s → 16s → 30s (cap)`, máximo 10 reintentos, idempotencia por `client_op_id`. Tras 10 reintentos la op queda `error_max_retries` y se muestra como conflicto.
- **Realtime** mantiene mirror fresco para los 5 catálogos; al detectar desconexión > 30 s se ejecuta `snapshotPull()` parcial al reconectar.
- **BroadcastChannel** sincroniza estado entre pestañas del mismo origen (pendingCount, conflicts, lastSyncAt).

## QA manual (PENDIENTE — requiere usuario humano)
Ver `parqueadero-web/specs/infrastructure/qa-manual-fase-8.md` (creado en esta sesión). Cubre 9 escenarios E1–E9: boot offline, login online → ops offline, salida offline con cobro, conflicto multi-dispositivo, stale-write multi-tab, logout con pendientes, coordinación multi-tab, Realtime de catálogos, cuota IndexedDB.

## Aplicación productiva (PENDIENTE)
- Aplicar migrations `00019`, `00020`, `00021` al backend (`supabase db push --linked` o Studio).
- Verificar que la publication `supabase_realtime` en producción incluye los 5 catálogos nuevos.
- Validar QA manual completo antes de cutover.
- Coordinar con Fase 11 (Siigo): la cola offline para FE queda fuera de scope; las facturas siguen requiriendo red (toggle desactivado al detectar offline).

## Bloqueos / Pendientes
- **E2E automatizado**: tests deshabilitados por orden del usuario (`feedback_no_tests`). Se reactivan en Fase 10.
- **Aplicación de migrations a producción**: requiere ventana de despliegue Fase 10.
- **Cancelación offline con refund**: si la sesión tiene `payment` registrado pero el row no está en mirror local (caso raro: sesión vieja sin pull), el refund se omite. Aceptado como caso borde; el operador puede emitir refund online cuando reconecte.
- **Coordinación con Fase 11**: emisión Siigo offline NO entra en outbox (las FE requieren red obligatoria). El toggle `emitInvoice` se deshabilita cuando `isOnline=false`.

## Next Steps
- [ ] QA manual completo (operador real, 1 h offline, 30+ operaciones, todos los escenarios E1–E9).
- [ ] Aplicar migrations `00019`, `00020`, `00021` al backend productivo (parte de Fase 10).
- [ ] Avanzar Fase 11 S6–S9 (Siigo UI + cutover) o Fase 10 (Deploy productivo) según prioridad del usuario.
- [ ] Considerar extender Realtime a `parking_sessions` para que un admin viendo el dashboard en otra pestaña vea entradas en tiempo real (no bloqueante para Fase 8).
