# Runbook de operación — Parqueadero

**Versión:** 0.1 (inicial — 2026-05-08)
**Audiencia:** equipo técnico que opera el sistema en producción.

> Este runbook es vivo. Actualízalo cada vez que descubras un procedimiento
> nuevo o que un caso documentado quede obsoleto. La fuente de verdad de la
> arquitectura está en `PLAN.md` y los `CLAUDE.md` por subproyecto; este
> documento solo cubre **operación**.

---

## 0. Contactos y dashboards

> ⚠️ Pendientes hasta cierre de Fase 10 (deploy productivo):
> - DSN Sentry web + backend.
> - URL panel Supabase prod (project ref).
> - Alias DNS productivo + cert.
> - Email de contacto técnico Siigo (`soporteapi@siigo.com`).

---

## 1. Backups y disaster recovery

### 1.1 Estrategia de backups

| Origen | Mecanismo | Frecuencia | Retención |
|---|---|---|---|
| Supabase Postgres | PITR (Point-In-Time-Recovery) — plan Pro+ | Continuo (WAL) | 7 días default |
| Supabase Postgres | Snapshot diario manual o automatizado | Diario | 30 días |
| Storage Supabase (PDFs Siigo si se cachean) | Replicación interna | — | — |
| PowerSync local SQLite | Cliente — al volver online sincroniza con Supabase | Continuo | — |
| Configuración Vercel/Netlify | git + lock file | Por commit | indefinido |

### 1.2 Restore desde PITR

1. En el dashboard Supabase → **Database → Backups → PITR**.
2. Seleccionar el punto en el tiempo previo al incidente.
3. Confirmar restore — Supabase clona el proyecto a un proyecto efímero.
4. Validar datos en el proyecto efímero (queries críticas: facturas del día, sesiones activas).
5. Cuando se confirme, promover el proyecto efímero a producción (cambia el endpoint).
6. Notificar al equipo y revertir cualquier traffic redirection a producción anterior.

> **Nunca aplicar PITR sobre el proyecto productivo en caliente** — el clone es lo seguro.

### 1.3 Verificación periódica de backup (hacer mensualmente)

```bash
# 1) Descargar último snapshot vía dashboard.
# 2) Restaurar local:
supabase db reset
psql "$LOCAL_DB_URL" < snapshot.sql
# 3) Smoke queries:
psql "$LOCAL_DB_URL" -c "SELECT count(*) FROM invoices WHERE issued_at > now() - interval '7 days';"
psql "$LOCAL_DB_URL" -c "SELECT count(*) FROM parking_sessions WHERE status='active';"
```

Documentar resultado en una entrada `sessions/YYYY-MM-DD-backup-drill.md`.

---

## 2. Operaciones de usuarios y roles

### 2.1 Reset de contraseña de un usuario

```bash
# Vía CLI Supabase (más rápido que dashboard):
supabase --project-ref <ref> auth admin update-user-by-email \
  user@example.com --password 'NEW_PASSWORD_TEMPORAL'
```

Pedir al usuario que cambie la contraseña en el primer login.

### 2.2 Cambiar el rol de un usuario

El claim del JWT se llama `user_role` (renombrado en migración 00009 para evitar choque con el `role` interno de PostgREST).

```sql
UPDATE public.users
SET role = 'admin'   -- valores válidos: 'admin' | 'operador' | 'contador'
WHERE id = '<uuid>';
```

El cambio se refleja en el siguiente JWT emitido (login o refresh). Si el usuario ya tiene sesión activa, debe hacer logout/login para que el claim se reinyecte vía `custom_access_token_hook`.

### 2.3 Reabrir un turno cerrado por error

```sql
-- 1) Verificar el turno:
SELECT id, user_id, opened_at, closed_at, status, cash_counted_cents
FROM cashier_shifts
WHERE id = '<shift_uuid>';

-- 2) Reabrir (deja audit_log automático):
UPDATE cashier_shifts
SET status = 'open',
    closed_at = NULL,
    cash_counted_cents = NULL,
    cash_difference_cents = NULL,
    closing_justification = NULL
WHERE id = '<shift_uuid>'
  AND status = 'closed';
```

> ⚠️ Esta operación viola el constraint `uq_shifts_open_per_user` si el operador ya abrió otro turno. Verifica antes con `SELECT * FROM cashier_shifts WHERE user_id=... AND status='open'`.

---

## 3. Facturación Siigo

### 3.1 Reintentar una factura `Rejected`

```sql
-- Resetear para que el cron polling la levante de nuevo:
UPDATE invoices
SET siigo_status = 'pending',
    siigo_attempts = 0,
    siigo_last_error = NULL
WHERE id = '<invoice_uuid>'
  AND siigo_status IN ('Rejected', 'error_max_retries');
```

El cron `siigo-poll-status` (cada 30 s) la procesará automáticamente.

### 3.2 Marcar factura como manual (Siigo no responde)

```sql
UPDATE invoices
SET siigo_status = 'queued_offline',
    siigo_observations = '{"manual":"emisión manual en portal Siigo"}'::jsonb
WHERE id = '<invoice_uuid>';
```

### 3.3 Auditoría de intentos Siigo

```sql
SELECT created_at, http_status, http_method, endpoint, response_payload
FROM siigo_invoice_attempts
WHERE invoice_id = '<invoice_uuid>'
ORDER BY created_at DESC;
```

`siigo_invoice_attempts` es append-only (RLS service_role) — operadores y admins no pueden modificarla.

### 3.4 Troubleshooting offline (Fase 8)

Esta sección cubre el modo offline operador-only (mirror Dexie + outbox + Realtime).
Aplica a partir de las migraciones `00019`, `00020`, `00021`. Si esas no están
aplicadas en el entorno, ver "Migration de producción no aplicada" abajo.

#### Inspeccionar Dexie desde DevTools

1. Abrir DevTools → pestaña **Application** (Chrome/Edge) o **Storage** (Firefox).
2. Sidebar → **IndexedDB** → `parqueadero-local-db` → expandir.
3. Stores relevantes:
   - `outbox` — operaciones pendientes de sincronizar.
   - `conflicts` — conflictos sin resolver (visibles para el operador).
   - `_meta` — metadatos (`lastSyncAt`, versión schema, deviceId).
   - `parking_sessions`, `payments`, `cashier_shifts`, `cash_withdrawals` — mirror mutable.
   - `tariffs`, `monthly_plans`, `customers`, `vehicles`, `app_settings` — mirror read-only.
4. Doble-click en una fila para inspeccionar/editar (solo para diagnóstico; **no** editar en producción).

#### Ver outbox pendiente desde consola

```js
// Pendientes:
await window.__dexie?.outbox.where('status').equals('pending').toArray()

// Con error o reintentos altos:
await window.__dexie?.outbox.where('attempts').above(3).toArray()

// Todas (ordenadas por enqueuedAt):
await window.__dexie?.outbox.orderBy('enqueuedAt').toArray()
```

> `window.__dexie` solo está expuesto en builds dev. En prod usar DevTools → IndexedDB.

#### Resetear la base local manualmente

```js
// Opción A — desde consola (limpia TODO sin perder server data):
await window.__dexie?.delete()
location.reload()

// Opción B — desde DevTools:
// Application → IndexedDB → parqueadero-local-db → click derecho → Delete database.
// Luego recargar.
```

> El operador pierde el mirror local pero el server-side queda intacto. El siguiente
> login re-ejecuta `snapshotPull()` y reconstruye el mirror.

#### `pendingCount` queda alto sin avanzar

1. Verificar `_lastSyncAt` en `_meta`: si no avanza en > 1 min con red activa, el
   orchestrator está bloqueado o la op de cabeza FIFO está fallando.
2. Revisar `outbox` por filas con `attempts >= 10` y `status = 'error_max_retries'` —
   son las que bloquean el avance del FIFO (no porque sean head-of-line, sino porque
   acumulan ruido visual).
3. Revisar telemetría: `await window.__telemetry?.recent('sync_failed', 20)` muestra
   los últimos 20 fallos con `errorCode`/`endpoint`.
4. Si la causa raíz es un bug, escalación a equipo dev con export de telemetría:
   `JSON.stringify(await window.__telemetry?.all())`.

#### Conflicts no se vacían

- El operador debe abrir el banner rojo → **Resolver conflictos** → elegir estrategia
  por cada fila (`server-wins`, `retry-now`, `discard-local`, `manual-edit`).
- Si el dialog no abre: revisar consola por `NullInjectorError` (típico si falta
  `injector` + `viewContainerRef` en el `dialog.open()` — ver memoria
  `feedback_cdk_dialog_vcr`).
- Inspección directa:

  ```js
  await window.__dexie?.conflicts.toArray()
  ```

- **No** borrar manualmente de la tabla `conflicts`: si el operador no resuelve,
  el row queda y el outbox no puede avanzar más allá del head FIFO.

#### Multi-tab: pestañas divergentes

1. Cerrar **todas** las pestañas del dominio.
2. Reabrir **una sola** pestaña.
3. Si tras login los contadores siguen inconsistentes (pendingCount ≠ outbox real),
   ejecutar reset local (sección anterior) y volver a login.

> Nota: un simple `F5` (reload) **no** invoca `localDb.clear()`. El mirror persiste
> entre recargas — es intencional para que las recargas accidentales no pierdan
> trabajo offline. Solo `logout` o reset manual limpian.

#### Realtime no conecta

1. DevTools → **Network** → filtrar por `wss://` o `realtime`. Debe haber un
   WebSocket abierto al endpoint `realtime/v1/websocket`.
2. Si no hay socket abierto: revisar `_realtimeRetry` (`window.__orchestrator?.realtimeRetryMap`).
   Cada canal lleva su contador de retries con backoff `1s → 30s`.
3. Verificar en backend que la publication incluye los 5 catálogos:

   ```sql
   SELECT schemaname, tablename
   FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime'
   ORDER BY tablename;
   ```

   Deben aparecer: `tariffs`, `monthly_plans`, `customers`, `vehicles`, `app_settings`
   (más cualquier tabla previa).
4. Si los catálogos faltan: migration `00019` no se aplicó. Aplicar y reiniciar el
   servicio Realtime de Supabase.

#### STALE_WRITE (P0409) recurrente

Síntoma: outbox repite `code: 'P0409'` o `errorMessage` con "stale write".

- Indica que el mismo registro fue modificado en server desde la última lectura del
  cliente. En operación normal (1 operador = 1 dispositivo) **no** debería ocurrir.
- Causas más probables:
  1. El operador tiene la app abierta en 2 dispositivos (laptop + tablet) y trabaja
     en ambos. Pedirle que use solo uno.
  2. Un admin editó la misma sesión desde el panel admin. Coordinar.
  3. Migration `00021` no se aplicó parcialmente. Verificar:

     ```sql
     SELECT tgname FROM pg_trigger WHERE tgname = 'trg_check_stale_write_parking_sessions';
     ```

- El conflict aparece en UI y el operador puede `retry-now` (acepta server) o
  `manual-edit` (re-aplica su cambio sobre el snapshot fresco).

#### Migration de producción no aplicada

**Síntomas:**
- Errores 404 / "column client_op_id does not exist" en outbox drain → `00020` falta.
- Realtime no envía deltas para `tariffs`/`monthly_plans`/etc → `00019` falta.
- No hay protección contra escritura stale; el banner amarillo nunca se torna rojo →
  `00021` falta.

**Aplicación:**

```bash
cd parqueadero-backend
supabase link --project-ref <prod-ref>
supabase db push --linked
# Verificar las 3 migrations:
psql "$DB_URL" -c "SELECT version FROM supabase_migrations.schema_migrations \
WHERE version IN ('00019','00020','00021') ORDER BY version;"
```

#### SQL útil para inspeccionar outbox server-side

```sql
-- Ver últimas 50 ops idempotentes recibidas (parking_sessions):
SELECT id, vehicle_plate, status, client_op_id, _sync_status, created_at
FROM parking_sessions
WHERE client_op_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 50;

-- Detectar reintentos idempotentes (mismo client_op_id, inserts duplicados que
-- el UNIQUE rechazó):
-- (No quedan rastros en BD por diseño — revisar logs Edge Function o telemetría web.)

-- Sesiones con _sync_status != 'synced' (debería estar siempre 'synced' server-side):
SELECT id, vehicle_plate, _sync_status, updated_at
FROM parking_sessions
WHERE _sync_status <> 'synced'
LIMIT 20;
```

#### Limpiar outbox local sin perder server data

Procedimiento recomendado (no destructivo en server):

1. El operador hace **Logout** desde el menú.
2. Si hay pendientes, aparece confirm-dialog "Hay N operaciones sin sincronizar.
   Si continúas, se perderán. ¿Continuar?".
3. **Cancelar** → operador espera reconexión y deja que el drain procese.
4. **Confirmar** → outbox + conflicts + mirror se borran; redirige a login. El
   server-side queda intacto: las ops nunca enviadas se pierden definitivamente
   (riesgo asumido conscientemente por el operador).

> Para un reset técnico sin login: usar `await window.__dexie?.delete()` desde
> consola, pero documentar la decisión en `sessions/` porque puede implicar pérdida
> de trabajo offline.

---

## 4. Migraciones de BD

### 4.1 Aplicar migración a producción

```bash
# 1) Confirmar que está aplicada localmente:
cd parqueadero-backend
supabase db reset
# 2) Linkar al proyecto prod (si no está linkeado):
supabase link --project-ref <prod-ref>
# 3) Push (DESTRUCTIVO si la migration tiene DROP — revisar antes):
supabase db push --linked
```

> 🚨 `supabase db push --linked` es destructivo. Pedir confirmación al usuario antes de ejecutar.

### 4.2 Rollback de una migración aplicada

PostgreSQL no soporta rollback automático. Procedimiento manual:

1. Si la migración solo agregó columnas: `ALTER TABLE … DROP COLUMN …`.
2. Si renombró: revertir el rename con migration nueva (NO editar la original).
3. Si modificó datos: restore desde PITR (sección 1.2).
4. Documentar el rollback con una migration nueva (numeración consecutiva) para que el historial sea consistente.

---

## 5. Troubleshooting común

### 5.1 "Operador no puede registrar entrada"

Causas frecuentes:
1. **Turno cerrado**: verifica `cashier_shifts WHERE user_id=... AND status='open'`. Si no hay → el operador debe abrir turno.
2. **JWT sin `user_role`**: revisar `auth.hook.custom_access_token` en `supabase/config.toml` (debe estar `enabled = true`). Si está desactivado, el JWT no trae el claim y RLS bloquea.
3. **Constraint `uq_sessions_active`**: la placa ya tiene una sesión activa. Buscar en `parking_sessions WHERE vehicle_plate=... AND status='active'`.

### 5.2 "Factura quedó en `pending` indefinido"

1. Confirmar que el cron `siigo-poll-status` está activo: `SELECT * FROM cron.job WHERE jobname='siigo-poll-status';`.
2. Revisar `siigo_attempts` — si > 5, ya hizo backoff hasta 5 min.
3. Revisar `siigo_invoice_attempts` para el último error HTTP.
4. Si `siigo_last_error` menciona auth → revisar `siigo_auth_tokens`, podría estar expirado o con `username/access_key` incorrecto.

### 5.3 "PowerSync no sincroniza"

1. Verificar `network-info.service` en cliente — `isOnline()` debe ser true.
2. Revisar `sync-rules.yaml` y confirmar que el operador tiene buckets asignados.
3. Logs PowerSync: `docker logs <powersync-container>` (self-hosted) o panel `app.powersync.com`.

### 5.4 "JWT inválido tras cambio de rol"

El claim solo se actualiza en el siguiente login/refresh. Pedir al usuario que cierre sesión y vuelva a entrar.

---

## 6. Plan de rollback de deploy web

```bash
# Vercel (preferido):
vercel rollback <previous-deployment-url> --prod
# Netlify:
netlify deploy --prod --alias previous-build
```

Si el rollback es por bug crítico, abrir incidente en `sessions/YYYY-MM-DD-incident-*.md` con timeline + causa raíz.

---

## 7. Auditoría rápida del estado del sistema

```sql
-- Sesiones activas + tiempo en parqueo:
SELECT vehicle_plate, vehicle_type,
       extract(epoch from (now() - entry_at))/60 as minutos
FROM parking_sessions WHERE status='active'
ORDER BY entry_at;

-- Turnos abiertos:
SELECT u.email, s.opened_at, s.cash_initial_cents
FROM cashier_shifts s JOIN users u ON s.user_id=u.id
WHERE s.status='open';

-- Facturas Siigo en pending o Rejected hoy:
SELECT internal_number, siigo_status, siigo_attempts, siigo_last_error
FROM invoices
WHERE issued_at::date = current_date
  AND siigo_status IN ('pending','InProcess','Sent','Rejected');

-- audit_log últimas 24 h:
SELECT created_at, user_id, action, entity_type
FROM audit_log
WHERE created_at > now() - interval '24 hours'
ORDER BY created_at DESC LIMIT 50;
```
