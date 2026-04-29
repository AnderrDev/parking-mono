# Sesión: Fase 1 — Backend foundation (schema + RLS + helpers)

**Fecha:** 2026-04-28 *(2ª sesión del día tras Fase 0)*
**Subproyecto(s):** parqueadero-backend
**Estado:** completada (commit pendiente de confirmar con el usuario)

## Objetivos
- [x] Actualizar specs (BIGINT, users mirror auth, audit immutability, FK circular, JWT hook dep, orden de creación)
- [x] Migration `00001_extensions_and_helpers.sql`
- [x] Migration `00002_initial_schema.sql` (10 tablas + constraints únicos parciales + índices)
- [x] Migration `00003_rls_policies.sql` (FORCE RLS + matriz por rol)
- [x] Migration `00004_triggers.sql` (set_updated_at + audit + assign_invoice_number)
- [x] `seed.sql` (3 tarifas + admin@parqueadero.local + cliente demo + plan ABC123)
- [x] Tests RLS en `supabase/tests/rls/` (3 archivos) + `run-rls-tests.sh`
- [x] DoD: `supabase db reset` sin errores; 3/3 tests pasan; 11/11 tablas con RLS
- [ ] Commit + handoff Fase 2 *(commit pendiente)*

## Contexto
Cierra Fase 1 del PLAN.md. Foundation backend para que las features posteriores consuman tablas + policies sin trabajo SQL adicional. Specs autoridad: `parqueadero-backend/specs/database-schema.spec.md` y `rls-policies.spec.md`.

## Decisiones aprobadas pre-código (vía AskUserQuestion)
1. **`*_cents` → BIGINT** (no INTEGER). INT max = 2.147B cents = $21M COP, bajo para totales acumulados.
2. **`users.id REFERENCES auth.users(id) ON DELETE CASCADE`** (mirror pattern Supabase).
3. **`audit_log` inmutable vía TRIGGER + RLS** (RLS sola no aplica a service_role).
4. **Dependencia JWT hook Fase 3** documentada.
5. **FK circular `invoices ↔ payments`** vía ALTER post-creación.
6. **Orden de creación**: users → customers → vehicles → tariffs → monthly_plans → cashier_shifts → parking_sessions → invoices → invoice_lines → payments.
7. **Admin dev password**: `admin12345` (cumple `minimum_password_length=8`).

## Avance
1. **Specs actualizados**: 10+ ediciones a `database-schema.spec.md` (BIGINT en todos los `*_cents`, users mirror auth, audit trigger inmutabilidad, assign_invoice_number con LPAD/timezone, sección "Orden de creación", chk_monthly_plans_dates), y a `rls-policies.spec.md` (sección "Dependencia: JWT custom claim role", "audit_log doble defensa", FORCE RLS, WITH CHECK siempre).
2. **Migration 00001** (`extensions_and_helpers.sql`): pgcrypto, `set_updated_at()`, tabla `audit_log` con 3 índices, `audit_log_prevent_mutation()` + 2 triggers BEFORE UPDATE/DELETE, `write_audit_log()` SECURITY DEFINER con TG_TABLE_NAME y try/catch para `auth.uid()` (defensivo en seeds), sequence `invoice_number_seq` + `assign_invoice_number()` con LPAD 4 dígitos y `AT TIME ZONE 'America/Bogota'`, RLS de audit_log (ENABLE sin FORCE para que SECURITY DEFINER inserte; SELECT solo admin/contador).
3. **Migration 00002** (`initial_schema.sql`): 10 tablas en orden FK, todas con `created_at/updated_at TIMESTAMPTZ`, `_deleted BOOLEAN`. Tablas operativas (parking_sessions, payments) también con `_sync_status`. Constraints únicos parciales (`uq_sessions_active`, `uq_shifts_open_per_user`, `uq_customers_doc`). Check constraints (`chk_sessions_exit_after_entry`, `chk_monthly_plans_dates`, `chk_tariffs_validity`, `chk_shifts_close`). Índices: `idx_sessions_entry_user_date` con `(DATE(entry_at AT TIME ZONE 'America/Bogota'))` para queries del operador. ALTER TABLE final añade FK circular `fk_invoices_payment`.
4. **Migration 00003** (`rls_policies.sql`): ENABLE + FORCE en las 10 tablas. Patrón `<table>_admin_all` (FOR ALL con USING+WITH CHECK = 'admin'), `<table>_operador_<scoped>`, `<table>_contador_read`. payments tiene policy con EXISTS sobre cashier_shifts para validar shift abierto del operador. invoices/invoice_lines no tienen policies de cliente — solo admin + contador read; las inserciones legítimas vienen vía Edge Function (service_role).
5. **Migration 00004** (`triggers.sql`): 10 triggers `set_updated_at`, 5 triggers `write_audit_log` (parking_sessions, payments, invoices, monthly_plans, cashier_shifts), 1 trigger `assign_invoice_number`.
6. **seed.sql**: admin@parqueadero.local con UUID fijo `a0000000-0000-0000-0000-000000000001` (`crypt('admin12345', gen_salt('bf'))`), 3 tarifas, cliente demo cédula `1000000001`, plan mensual ABC123 30 días. Todo idempotente (ON CONFLICT DO NOTHING / ON CONFLICT DO UPDATE).
7. **Tests RLS** en `supabase/tests/rls/`:
   - `01_audit_log_immutable.test.sql`: confirma SQLSTATE 42501 en UPDATE y DELETE.
   - `02_invoice_number_sequence.test.sql`: 5 inserts → numbers únicos formato `FAC-YYYY-MM-DD-NNNN`.
   - `03_parking_sessions_rls.test.sql`: 4 subtests con `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ...)`. Cleanup idempotente al inicio Y al final.
8. **`run-rls-tests.sh`**: bash runner con `set -uo pipefail` (no `-e` porque captura exit_code), itera `*.test.sql`, grep "FAIL:" o exit_code != 0, output con ✅/❌.
9. **DoD ejecutado**:
   - `supabase db reset`: 4 migrations aplicadas sin error, seed cargado.
   - `pg_tables WHERE rowsecurity=false AND schemaname='public'` → 0 filas.
   - `./run-rls-tests.sh` → **3/3 tests pasan**.
   - audit_log capturó: 1 INSERT monthly_plan (seed) + 2 INSERT, 1 UPDATE, 2 DELETE de parking_sessions (test 03 setup + cleanup).
   - `assign_invoice_number` generó `FAC-2026-04-28-0001` … `0005`.

## Decisiones técnicas no obvias
- **`users.id` PK + FK a `auth.users(id) ON DELETE CASCADE`**: hace que `auth.uid() = users.id` directamente, eliminando lookups en cada policy.
- **`audit_log` ENABLE sin FORCE**: necesario para que `write_audit_log()` SECURITY DEFINER bypase RLS al insertar. FORCE haría que incluso el owner respete RLS.
- **`audit_log_prevent_mutation()` STATEMENT-level**: una sola excepción por statement en lugar de por row, suficiente porque no hay procesamiento real, solo bloqueo.
- **`write_audit_log()` con try/catch para `auth.uid()`**: cuando el seed corre sin contexto Supabase Auth, `auth.uid()` puede fallar. Try/catch defensivo + NULL.
- **FK circular invoices↔payments**: invoices.payment_id sin FK al crear (sólo UUID), luego `ALTER TABLE ADD CONSTRAINT` después de crear payments.
- **`raw_app_meta_data` con `role` claim en seed**: el JWT hook de Fase 3 leerá de aquí para inyectar el claim al token de acceso.
- **`assign_invoice_number` idempotente**: si NEW.number ya viene asignado (Edge Function podría hacerlo), no lo sobreescribe.
- **`_sync_status` solo en parking_sessions y payments** (no en todas): son las tablas que el operador escribe offline; el resto se sincroniza server-wins (catálogos) o no aplica (audit_log es server-only).

## Bloqueos / Pendientes
- **Commit pendiente**: regla absoluta del PLAN — confirmación previa.
- **Operador edit nombre**: la spec permite que el operador actualice su propio `nombre`. Postgres RLS no soporta column-level WITH CHECK; se necesita trigger BEFORE UPDATE en Fase 3 que verifique que (role, is_active, email) no cambien para no-admin. Anotado en migration 00003.

## Next Steps
- [ ] **Confirmar commit Fase 1** (mensaje propuesto: `feat(backend): schema + RLS + helpers (Fase 1)`).
- [ ] **Iniciar Fase 2 — Core Angular + design system**:
  1. Crear `sessions/YYYY-MM-DD-fase-2-core-angular.md`.
  2. Invocar skills: `angular-architect`, `ui-ux-parqueadero`, `frontend-quality`.
  3. Leer `parqueadero-web/CLAUDE.md` §3 (estructura), §4 (naming), §6 (failures), `parqueadero-web/specs/components/data-table.spec.md`, `parqueadero-web/specs/infrastructure/offline-sync.spec.md`.
  4. Crear `core/` (Either + 8 Failures + BaseEntity + UseCase + DI tokens + Supabase service + NetworkInfo service + Auth guard placeholder + error interceptor).
  5. `shared/` (utils ES-CO con UTC-5, validators placa/NIT/teléfono COL, pipes COP/timeAgo).
  6. Design tokens SCSS + dumb components (loading, error, confirm-dialog, status-badge, plate-input, search-input, data-table, offline-banner) + Inter + JetBrains Mono self-hosted.
  7. Shell con header/nav lateral + 8 lazy routes placeholder.

## Notas para el siguiente Claude
- **Para correr tests RLS**: necesita `supabase start` antes (con Docker arriba). Comando: `cd parqueadero-backend && ./supabase/tests/run-rls-tests.sh`.
- **`auth.uid()` lee** de `request.jwt.claim.sub` (formato viejo) o de `request.jwt.claims->>'sub'` (formato nuevo JSONB). En tests usar el JSON con `set_config('request.jwt.claims', json::text, TRUE)`.
- **Para simular un rol en psql**: además de set_config, hace falta `SET LOCAL ROLE authenticated` (porque postgres superuser bypasses todo).
- **El JWT hook `custom_access_token_hook` aún no existe** (Fase 3). Mientras tanto: cualquier acceso real desde Supabase JS Client traerá un JWT con `role='authenticated'` (rol estándar Supabase), NO con el `role` app. Las RLS quedarán denegando todo hasta que Fase 3 conecte el hook. Tests funcionan porque inyectan el claim manualmente.
- **`_sync_status` constraint**: `CHECK (_sync_status IN ('synced','pending','conflict'))`. Si se inserta otro valor → error. Considerar al implementar PowerSync en Fase 8.
- **Operaciones DELETE en `parking_sessions`/`payments`/`invoices` SÍ están permitidas a admin** y disparan audit_log con before_json. Soft delete (`UPDATE _deleted=TRUE`) es la convención de app, no del DB.

## Prompt de handoff para Fase 2
> Backend foundation cerrada (4 migrations, 11 tablas con RLS, 3 tests pasando, audit log funcionando). Iniciar **Fase 2 — Core Angular + design system + shared**. Trabajar SOLO en `parqueadero-web/`. Invocar skills `angular-architect`, `ui-ux-parqueadero`, `frontend-quality`. Lee `parqueadero-web/CLAUDE.md` §3-6, `specs/components/data-table.spec.md`, skill `ui-ux-parqueadero` §"Design Tokens". Crea `sessions/YYYY-MM-DD-fase-2-core-angular.md`. Bundle target: < 250 kB initial (actual baseline 113 kB). Recordar: pipes/utils requieren coverage 100% en tests; dumb components con CDK Dialog y a11y `role="status"` / `aria-live`. NO importes de `data/` ni `presentation/` desde `domain/`.
