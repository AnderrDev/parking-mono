# Sesión: Migración inicial a Supabase remoto

**Fecha:** 2026-05-15
**Subproyecto(s):** parqueadero-backend
**Estado:** completada (con next steps)

## Objetivos
- [x] Conectar el MCP de Supabase a Claude Code (scope local, read-only).
- [x] Inspeccionar el proyecto remoto y confirmar que está vacío.
- [x] Crear `specs/migration-to-remote.spec.md`.
- [x] `supabase link --project-ref hhwctcjwrlbqgsrfriqn`.
- [x] `supabase migration list --linked` (diff: 20 pendientes).
- [x] `supabase db push --linked` (20 migraciones aplicadas).
- [x] Verificación post-push: 15 tablas, 39 policies, 28 triggers, 20 migraciones registradas.
- [~] **CANCELADO** Deploy de Edge Functions — decisión del usuario: el negocio será POS normal, sin facturación electrónica DIAN/Siigo. Las 7 EF no se despliegan.
- [~] **CANCELADO** Configurar secrets DIAN/Siigo — no se necesitan.
- [x] **Eliminar cron `siigo-poll-every-30s`** vía `cron.unschedule()`. 0 cron jobs activos en remoto post-cleanup.
- [x] **Actualizado `environment.prod.ts`** con `supabaseUrl='https://hhwctcjwrlbqgsrfriqn.supabase.co'` y la `anon public` key (JWT verificado: role=anon, exp=2036).
- [x] **`environment.staging.ts`**: comentario actualizado para reflejar que NO existe proyecto staging y NO debe reutilizar creds de prod cuando se cree.

## Avance

1. **MCP de Supabase registrado** en `~/.claude.json` con scope `local` (no se commitea):
   ```
   supabase: npx -y @supabase/mcp-server-supabase@latest --read-only --project-ref=hhwctcjwrlbqgsrfriqn ✓ Connected
   ```
   Las tools `mcp__supabase__*` se cargan en la próxima sesión de Claude Code.
   Mientras tanto, se usa la **Management API + CLI** (mismo backend).

2. **Inspección del remoto** vía `GET /v1/projects/hhwctcjwrlbqgsrfriqn`:
   - Status: `ACTIVE_HEALTHY`
   - Postgres 17.6.1.121, región `us-west-2`
   - 0 migraciones aplicadas
   - 0 tablas en `public`
   - 0 Edge Functions
   - Extensiones default: `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`, `plpgsql`

3. **Spec creado**: `parqueadero-backend/specs/migration-to-remote.spec.md` con el plan completo (8 pasos), inventario de las 20 migraciones, 7 Edge Functions, y la tabla de secrets requeridos.

4. **Link al remoto** (`supabase link --project-ref hhwctcjwrlbqgsrfriqn`) — exitoso. Detectó diferencias en `config.toml` de auth (site_url, password length, JWT hook toggle, MFA, email confirmations) que se gestionan aparte (no afectan `db push`).

5. **Push aplicado** (`supabase db push --linked --include-all`) — las 20 migraciones aplicadas en orden, sin errores. Algunos NOTICE sobre objetos pre-existentes son esperados (las migraciones usan `IF NOT EXISTS`).

6. **Verificación post-push** vía Management API:
   - 15 tablas en `public`: app_settings, audit_log, cash_withdrawals, cashier_shifts, customers, invoice_lines, invoices, monthly_plans, parking_sessions, payments, siigo_auth_tokens, siigo_invoice_attempts, tariffs, users, vehicles.
   - 39 RLS policies, 28 triggers no internos, 20 migraciones registradas.
   - Extensiones: pg_cron, pg_net, pgcrypto, uuid-ossp, supabase_vault, pg_stat_statements.
   - 1 cron job activo: `siigo-poll-every-30s` (schedule = `30 seconds`). ⚠️ ver Bloqueos.
   - Realtime publication `supabase_realtime` con 10 tablas: app_settings, cash_withdrawals, cashier_shifts, customers, invoices, monthly_plans, parking_sessions, payments, tariffs, vehicles.

## Decisiones

- **MCP en modo `--read-only`**: el MCP solo lee. Las operaciones DDL (push, deploy) pasan por `supabase` CLI con la regla de confirmación previa.
- **No usar `supabase db reset --linked`** ni ahora ni más adelante: borra `auth.users`. Para este primer push (remoto vacío) no es necesario.
- **No incluir `seed.sql`** en el push: contiene data de dev. Si se requiere seed productivo, se hará en una sesión aparte.
- **Token PAT en el chat**: el usuario aceptó. Hay que rotarlo al cerrar.

## Decisión clave de la sesión

**El usuario confirmó que el negocio será POS normal — sin facturación electrónica DIAN/Siigo.** Esto implica:

- Las 7 Edge Functions NO se despliegan en esta migración. Las que dependían de Siigo/DIAN (`request-invoice`, `siigo-emit-invoice`, `siigo-poll-status`) quedan sin función en el remoto. Las que NO dependen (`manage-users`, `process-payment`, `renew-monthly`, `report-export`) tampoco se despliegan en esta sesión — se evalúan si se necesitan más adelante.
- El cron `siigo-poll-every-30s` que la migración 00014 dejó activo fue **eliminado** del remoto vía `SELECT cron.unschedule('siigo-poll-every-30s')`. Verificado: 0 cron jobs activos.
- Las tablas `siigo_auth_tokens` y `siigo_invoice_attempts` quedan creadas pero vacías. No se eliminan (son inocuas). Si se confirma a futuro que no se usarán, se puede crear migración `00021_drop_siigo.sql`.

## Bloqueos / Pendientes

- **Resuelto**: ANON_KEY pasada por el usuario, verificada (role=anon, exp=2036), hardcoded en `environment.prod.ts`. Se eligió hardcodeo sobre inyección por CI porque no hay pipeline CI conectado todavía.

- **Pasos manuales en dashboard del remoto**:
  - Auth → URL Configuration → cambiar `site_url` al dominio de producción (hoy está como `http://localhost:3000`).
  - Auth → Hooks → habilitar `custom_access_token` hook (la función SQL existe, solo falta el toggle).
  - Auth → Providers → revisar config (email/password, MFA si aplica).

- **Pendiente verificación funcional**: una vez actualizados los environments, hacer `ng build --configuration=production` y probar login con un usuario sembrado en el remoto. No se siembra usuario en esta sesión.

- **Limpieza opcional**: revocar/rotar el PAT `sbp_85509...` y la DB password `NNJR3...` cuando termine la migración. Ambas quedaron en el chat por decisión explícita del usuario.

## Next Steps

- [ ] **Inmediato**: sembrar primer usuario admin en remoto (vía SQL Editor o `INSERT INTO auth.users …`). Sin este paso, login en prod falla.
- [ ] Habilitar JWT hook `custom_access_token` desde dashboard.
- [ ] Cambiar `site_url` en Auth → URL Configuration al dominio de producción del frontend.
- [x] `ng build --configuration=production` ✓ exitoso (4.4s, warning preexistente de bundle size). Verificado que `chunk-L3PAMKZS.js` embebe el project-ref `hhwctcjwrlbqgsrfriqn`. Falta probar login real contra el remoto (necesita usuario sembrado primero).
- [ ] Decidir si se elimina `siigo_*` del schema (migración opcional `00021_drop_siigo.sql`).
- [ ] Rotar PAT y DB password al cerrar todo. Si la rotación de DB password tumba la conexión local, re-correr `supabase link --project-ref hhwctcjwrlbqgsrfriqn` con la nueva password.
