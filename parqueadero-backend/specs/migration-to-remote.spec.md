# Spec: Migración inicial a Supabase remoto

**Estado:** completado parcialmente (DB migrada; EF descartadas por decisión del usuario)
**Fecha inicio:** 2026-05-15
**Subproyecto:** parqueadero-backend
**Operador:** Claude Code + Ander

## Contexto

Migración del schema completo de desarrollo local (Supabase 17, vía Docker) al proyecto Supabase remoto `hhwctcjwrlbqgsrfriqn` (creado el 2026-05-15, región `us-west-2`, Postgres 17.6).

El remoto está **vacío** (0 migraciones, 0 tablas en `public`, 0 Edge Functions desplegadas). Solo trae las extensiones default de Supabase: `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`, `plpgsql`.

## Objetivo

Llevar el remoto a paridad estructural con `parqueadero-backend/supabase/migrations/` (00001 → 00019) y desplegar las 7 Edge Functions productivas. No se migra `seed.sql` (es solo data de dev).

## Inventario local

### Migraciones (20, idempotentes)
```
00001_extensions_and_helpers.sql      ← pgcrypto, citext, etc.
00002_initial_schema.sql              ← tablas core (vehicles, sessions, customers, ...)
00003_rls_policies.sql                ← policies por rol
00004_triggers.sql                    ← audit_log, calc_total, etc.
00005_auth_jwt_hook.sql               ← custom_access_token hook
00006_schema_additions.sql
00007_invoicing_sequence.sql          ← invoice_number sequence (server-only)
00008_fix_jwt_hook_permissions.sql
00009_user_role_claim.sql
00010_cash_withdrawals_and_settings.sql
00011_payments_justification.sql
00012_audit_log_view.sql
00013_siigo_integration.sql           ← Fase 11
00014_siigo_polling_cron.sql          ← pg_cron job
00015_monthly_tariff_unit.sql
00016_tax_config_settings.sql         ← IVA 19% incluido
00017_siigo_cufe_unique.sql
00018_realtime_publications.sql       ← Fase 8 prep
00019_realtime_offline_mirror.sql     ← Fase 8 prep (PowerSync mirror)
00020_outbox_idempotency.sql          ← Fase 8 Sprint 2: client_op_id + outbox
```

### Edge Functions (7 productivas + helpers en `_shared/`)
```
manage-users          ← admin invita/lista usuarios
process-payment       ← cierra sesión, calcula total, marca pago
renew-monthly         ← renovación de mensualidades
report-export         ← export CSV/Excel
request-invoice       ← dispara facturación DIAN/Siigo
siigo-emit-invoice    ← emite factura en Siigo
siigo-poll-status     ← cron polling de Siigo
```

## Pasos

### 1. Registrar MCP (read-only) ✅
```bash
claude mcp add supabase --scope local \
  -e SUPABASE_ACCESS_TOKEN=*** \
  -- npx -y @supabase/mcp-server-supabase@latest \
     --read-only --project-ref=hhwctcjwrlbqgsrfriqn
```
- Scope: `local` (no commit al repo)
- `--read-only`: las operaciones destructivas siguen pasando por CLI con confirmación.

### 2. Inspección remota (no destructivo) ✅
Via Management API: confirmado proyecto vacío. Sin riesgo de colisión.

### 3. Enlazar proyecto local con remoto (no destructivo)
```bash
SUPABASE_ACCESS_TOKEN=*** supabase link --project-ref hhwctcjwrlbqgsrfriqn
```
Esto solo escribe `parqueadero-backend/supabase/.temp/project-ref`. No toca el remoto.

### 4. Diff de migraciones (no destructivo)
```bash
supabase migration list --linked
```
Debe mostrar las 19 locales como "Local" y nada en "Remote".

### 5. Aplicar migraciones a remoto ⚠️ DESTRUCTIVO — requiere OK del usuario
```bash
supabase db push --linked
```
- Aplica las 20 migraciones en orden.
- Se monitorea cada paso; ante fallo se detiene.

**Rollback:** Como el remoto está vacío, rollback = "soltar todo lo aplicado". Si una migración falla a mitad:
- Las anteriores ya están commiteadas (cada `.sql` es una transacción independiente del CLI).
- Plan B: borrar las tablas creadas vía SQL Editor y reintentar. El esquema vacío facilita esto.
- No se hace `supabase db reset --linked` (también borraría auth users si los hubiera).

### ❌ 5b. Post-push: eliminación de cron Siigo (2026-05-15)
Decisión: el negocio será POS normal, sin facturación electrónica. Se ejecuta:
```sql
SELECT cron.unschedule('siigo-poll-every-30s');
```
Verificado vía Management API: 0 cron jobs activos en remoto.

Las tablas `siigo_auth_tokens` y `siigo_invoice_attempts` quedan creadas pero sin uso. No se eliminan. Si se confirma que nunca se usarán, crear `00021_drop_siigo.sql`.

### ❌ 6. Configurar secrets para Edge Functions — DESCARTADO
Auto-inyectados por Supabase (no requieren `secrets set`):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

A configurar manualmente con `supabase secrets set --linked KEY=VALUE`:

| Key | Usado por | Notas |
|---|---|---|
| `DIAN_FE_SERVICE_URL` | request-invoice, siigo-emit-invoice | URL del FastAPI en Fly.io |
| `SIIGO_USERNAME` | siigo-* | Usuario Siigo |
| `SIIGO_ACCESS_KEY` | siigo-* | API key |
| `SIIGO_PARTNER_ID` | siigo-* | Partner ID Siigo |
| `SIIGO_PRODUCT_ID_PARKING_HOUR` | siigo-emit-invoice | Código producto Siigo |
| `SIIGO_BASE_URL` | siigo-* | Default `https://api.siigo.com` |
| `SIIGO_HTTP_TIMEOUT_MS` | siigo-* | Opcional, default 28000 |
| `SIIGO_POLL_MAX_RETRIES` | siigo-poll-status | Opcional, default 30 |

Si el usuario aún no tiene credenciales Siigo, se despliegan las EF que **no** dependen de Siigo y se difieren las demás.

### ❌ 7. Desplegar Edge Functions — DESCARTADO (POS normal, sin DIAN/Siigo)
```bash
supabase functions deploy manage-users --linked
supabase functions deploy process-payment --linked
supabase functions deploy renew-monthly --linked
supabase functions deploy report-export --linked
supabase functions deploy request-invoice --linked
supabase functions deploy siigo-emit-invoice --linked
supabase functions deploy siigo-poll-status --linked
```

### 8. Verificación post-migración
- `supabase migration list --linked` → 19 remotas, 0 pendientes.
- Query: `SELECT count(*) FROM pg_tables WHERE schemaname='public'` → > 0.
- Listar EF: GET `/v1/projects/{ref}/functions` → 7 entradas.
- Llamar `manage-users` con un JWT admin como smoke test.

## Pendientes post-spec
- Configurar **auth providers** desde dashboard (no automatizable vía CLI sin perder estado): email, password policy.
- Habilitar **JWT hook** `custom_access_token` desde dashboard → Auth → Hooks (la función ya queda creada por la migración `00005`, pero el toggle del hook es manual).
- Habilitar **Realtime** en las tablas que usa `00018`/`00019` (suele venir on por default si la publication existe).
- Sembrar usuarios admin iniciales vía `manage-users` o SQL directo (después del push).
- Frontend (`parqueadero-web/`) debe apuntar a:
  - `SUPABASE_URL=https://hhwctcjwrlbqgsrfriqn.supabase.co`
  - `SUPABASE_ANON_KEY=<dashboard → Settings → API>`
  Actualizar `parqueadero-web/src/environments/environment.prod.ts` (no se toca en esta sesión).

## Bitácora
Ver `sessions/2026-05-15-migracion-remoto.md`.
