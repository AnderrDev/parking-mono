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
