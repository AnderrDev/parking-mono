# Plan de Trabajo (Claude Code) — `parqueadero-web` + `parqueadero-backend`

**Versión:** 2.0 (reformateado para agentes Claude Code)
**Última actualización:** 2026-04-28
**Alcance:** Solo `parqueadero-web` (Angular PWA) y `parqueadero-backend` (Supabase).
**Fuera de alcance:** `dian-fe-service` se planificará aparte. Este plan deja un **stub** del flujo de facturación electrónica en la Fase 9 para que la integración real se enchufe sin re-arquitectura.

---

## Cómo opera un agente con este plan

Este documento es un **runbook para agentes Claude Code**. Cada fase está escrita como un job autocontenido: setup (lo que el agente carga), tareas (con comandos y archivos concretos), DoD (verificable por comandos), y prompt de handoff (para iniciar la siguiente fase).

### Protocolo de sesión (obligatorio cada vez que un agente abre trabajo)

```
1. LEE el CLAUDE.md raíz (lo carga automático el harness; confírmalo).
2. LEE la entrada más reciente en sessions/ — recupera contexto de la sesión anterior.
3. LEE la fase activa en este PLAN.md (busca el marker "**Fase actual:**" abajo).
4. LEE las specs listadas en "📐 Specs" de la fase.
5. LEE el sub-CLAUDE.md del subproyecto donde trabajarás (parqueadero-web/CLAUDE.md
   o parqueadero-backend/CLAUDE.md).
6. INVOCA los skills listados en "🛠️ Skills" de la fase (cargan como guías persistentes).
7. CREA sessions/YYYY-MM-DD-faseN-<slug>.md con la plantilla de sessions/README.md.
8. USA TaskCreate para trackear las sub-tareas de la fase dentro de la sesión.
9. IMPLEMENTA. Marca [x] en este PLAN.md a medida que cierras tareas.
10. AL CERRAR la sesión: corre los comandos de DoD, deja Estado en la bitácora,
    actualiza "**Fase actual:**" abajo si la fase quedó cerrada,
    y escribe el "Prompt de handoff" en la sesión para que la próxima invocación
    arranque sin fricción.
```

### Reglas absolutas (no las violes; bloquean trabajo si las saltas)

1. **Spec primero.** Antes de escribir código, verifica con `ls` o `Read` que el spec referenciado existe. Si falta, **CREA EL SPEC primero y PIDE CONFIRMACIÓN al usuario antes de avanzar a código**. No improvises.
2. **Tests acompañan al código** en la misma sesión. No "los hago después". DoD de fase los exige.
3. **Si falla un test o un DoD check, NO avances.** Registra el bloqueo en la sesión con `Estado: bloqueada` y pregunta al usuario.
4. **Acciones destructivas siempre con confirmación previa**: `git push`, `git reset --hard`, `supabase db push --linked`, `supabase db reset` contra prod, `fly deploy`, eliminar archivos del usuario. Pregunta antes.
5. **Si un cambio de comportamiento implica modificar un spec**, actualiza el spec **antes** que el código y deja constancia en la sesión.
6. **No infieras valores faltantes** (URLs, NITs, claves técnicas, emails de admin). Pregúntalos.
7. **Comentarios y copy de UI en español Colombia.** Identificadores de código en inglés. Dinero en `*_cents` enteros. Tiempos en UTC-5 (`America/Bogota`).
8. **No hay branch ni `git push` automático.** Operas en el árbol local. El usuario decide cuándo hacer commit/push (ver Fase 0 para inicializar git).

### Skills disponibles (mapping fase → skill)

| Skill | Cuándo invocarlo | Carga |
|---|---|---|
| `angular-architect` | Cualquier fase que toque `parqueadero-web/` | Conventions Angular 18, clean architecture, Either, formularios via `XxxForms`, DI con InjectionTokens |
| `supabase-expert` | Cualquier fase que toque `parqueadero-backend/` | Migrations, RLS, Edge Functions Deno, triggers, naming SQL |
| `frontend-quality` | Después de cualquier cambio UI antes de cerrar sesión | A11y WCAG 2.2 AA, Core Web Vitals, PWA, TS strict |
| `ui-ux-parqueadero` | Diseño de pantallas/componentes/tokens | Design system POS-style operario, 5 estados, copy ES-CO |
| `frontend-design` (plugin) | Diseño visual genérico no específico operario | Patrones de marketing/landing/CMS |

Otros skills útiles bajo demanda: `simplify` (revisar código nuevo antes de cerrar fase), `fewer-permission-prompts` (si las llamadas Bash interrumpen demasiado).

### Tooling esperado por el agente

| Tarea | Tool | Notas |
|---|---|---|
| Leer specs / código | `Read` | Una sola lectura por archivo por sesión cuando sea posible |
| Modificar archivo existente | `Edit` (preferido) o `Write` (solo nuevos) | `Edit` requiere `Read` previo |
| Crear archivo nuevo | `Write` | Comprueba que el directorio existe |
| Búsqueda amplia en specs/código | `Agent` con `subagent_type: Explore` | Si necesita >3 búsquedas, delegar |
| Correr migraciones, tests, build | `Bash` | Confirmar antes de operaciones destructivas |
| Tracking interno de sub-tareas | `TaskCreate` / `TaskUpdate` | Una task por sub-tarea de la fase |

---

## Resumen de fases

| # | Fase | Subproyecto | Skills clave |
|---|---|---|---|
| 0 | Bootstrap (tooling, git, deps) | ambos | — |
| 1 | Schema + RLS + helpers SQL | backend | `supabase-expert` |
| 2 | Core Angular + design system + shared | web | `angular-architect`, `ui-ux-parqueadero`, `frontend-quality` |
| 3 | Auth (Supabase Auth + login + guards) | ambos | `supabase-expert`, `angular-architect` |
| 4 | Parking — vertical slice (entrada / salida / cobro) | ambos | todos |
| 5 | Catálogos (tarifas · vehículos · clientes · planes) | ambos | `angular-architect`, `supabase-expert`, `ui-ux-parqueadero` |
| 6 | Cierre de caja + payments | ambos | `angular-architect`, `supabase-expert` |
| 7 | Reportes operativos y financieros | ambos | `supabase-expert`, `angular-architect` |
| 8 | Offline hardening (PowerSync, conflictos) | ambos | `angular-architect`, `frontend-quality` |
| 9 | Invoicing UI + Edge Function `request-invoice` con **stub DIAN** | ambos | `supabase-expert`, `angular-architect` |
| 10 | QA, hardening, deploy productivo | ambos | `frontend-quality`, `supabase-expert` |

**Camino crítico:** 0 → 1 → 2 → 3 → 4 → 6 → 9 → 10. Las Fases 5, 7, 8 pueden trabajarse en sesiones paralelas si el usuario abre dos chats al mismo tiempo (no es lo común; default = secuencial).

**Fase actual:** ✅ Fase 1 cerrada — siguiente: ⏳ Fase 2 (Core Angular + design system).

---

## Fase 0 — Bootstrap

🎯 **Goal:** Repos arrancables localmente, dependencias instaladas, git inicializado.

🛠️ **Skills:** ninguno (es scaffolding).

📐 **Specs:** ninguno (técnico puro).

📂 **Lectura previa obligatoria:**
- `README.md` raíz §"Cómo Empezar" — verifica que los pasos coincidan con lo que vas a ejecutar.
- `parqueadero-web/CLAUDE.md` §3 (estructura) — para no romper el árbol scaffolded.
- `parqueadero-backend/CLAUDE.md` §2 (estructura) — idem.

📋 **Tareas:**

**Repo raíz**
- [x] Confirmar con el usuario antes de `git init` (es destructivo si se equivoca de directorio).
- [x] `git init` en `/Users/ander/Documents/parqueadero/`. *(hecho en sesión previa)*
- [x] Crear `.gitignore` raíz.
- [x] Crear `.editorconfig`.
- [ ] ~Pedir al usuario el remote opcional~ — pendiente (decidido posponer; trabajamos local).

**parqueadero-web**
- [x] Confirmar con el usuario que aplicar `ng new` aquí está OK.
- [x] Ejecutar: `ng new parqueadero-web --directory=. --skip-git --style=scss --routing --ssr=false --package-manager=npm --strict --defaults`. *(Nota: `ng new .` falla en Angular 18 porque `.` no pasa schema validation; se usa `--directory=.`.)*
- [x] Instalar deps: `npm i @supabase/supabase-js @powersync/web @angular/cdk@18 @angular/material@18 lucide-angular date-fns date-fns-tz`. *(Nota: PowerSync se rebrandeó — el paquete `@journeyapps/powersync-sdk` está deprecado; el actual es `@powersync/web`. CDK/Material requieren pin `@18` para Angular 18.)*
- [x] PWA: `ng add @angular/pwa@18 --skip-confirmation`.
- [x] Tooling: `ng add @angular-eslint/schematics@18 --skip-confirmation` y `npm i -D prettier eslint-config-prettier`. Incluido `prettierConfig` como último entry en `eslint.config.js`.
- [x] Editar `tsconfig.json`: añadir `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. (`noImplicitOverride` ya venía por scaffold.)
- [x] Editar `angular.json` budgets: `initial.maximumWarning = "250kB"`, `maximumError = "350kB"`. `anyComponentStyle` subido a 4kB/8kB para dejar margen razonable.
- [x] Crear `.env.example` con `SUPABASE_URL=`, `SUPABASE_ANON_KEY=`, `POWERSYNC_URL=`, `DIAN_FE_SERVICE_URL=`.
- [x] Añadir scripts: `format`, `format:check`, `analyze`.
- [x] Crear `.prettierrc` (printWidth 100, single quotes, trailing commas all, parser angular para html).

**parqueadero-backend**
- [x] Confirmar antes de `supabase init`.
- [x] `cd parqueadero-backend && supabase init` (aceptar defaults).
- [x] Editar `config.toml`: `auth.jwt_expiry = 3600` (default), `auth.minimum_password_length = 8`, `db.major_version = 17` (default actual de supabase init; PLAN sugería 15/16 pero 17 funciona y es lo que asume cloud al crear proyecto nuevo). **`[functions] verify_jwt` no existe en CLI 2.34+** — el JWT verification se configura por función al hacer `supabase functions deploy --no-verify-jwt` (default = JWT requerido). Anotado.
- [x] Crear `.env.example` con `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DIAN_FE_SERVICE_URL`, `WOMPI_*`.
- [x] Decidido: solo local con Docker en Fase 0. Link a remoto se pospone hasta Fase 10.
- [x] `supabase start` levanta (API :54321, Studio :54323, DB :54322).

**Commit inicial**
- [ ] Confirmar con el usuario antes del primer `git commit`. *(pendiente al cierre de sesión)*
- [ ] Commit: `"chore: bootstrap web (Angular 18 PWA) y backend (Supabase) + tooling base"`.

✅ **DoD (comandos que debes correr y pasar):**
```bash
# 1. Web arranca
cd parqueadero-web && npm install && npm run start &
sleep 10 && curl -sf http://localhost:4200 > /dev/null && echo "OK web"
kill %1

# 2. Backend levanta
cd parqueadero-backend && supabase start
supabase status | grep -q "API URL" && echo "OK backend"
supabase stop

# 3. Git tiene al menos 1 commit
git log --oneline | wc -l   # debe ser >= 1

# 4. Lint pasa en web
cd parqueadero-web && npm run lint
```

🔁 **Prompt de handoff (escríbelo en la sesión al cerrar):**
> Bootstrap listo. Próxima sesión: **Fase 1 — Backend foundation**. Lee `parqueadero-backend/specs/database-schema.spec.md` y `rls-policies.spec.md` completos antes de tocar SQL. Invoca skill `supabase-expert`. Crea `sessions/YYYY-MM-DD-fase-1-schema-rls.md`.

---

## Fase 1 — Backend foundation

🎯 **Goal:** Schema completo + RLS por rol + helpers (audit, updated_at, numeración) listos para que cualquier feature posterior consuma.

🛠️ **Skills:** `supabase-expert`.

📐 **Specs (lectura obligatoria antes de escribir SQL):**
- `parqueadero-backend/specs/database-schema.spec.md` — autoridad sobre tablas/columnas/constraints.
- `parqueadero-backend/specs/rls-policies.spec.md` — autoridad sobre matriz de permisos por rol.

📂 **Lectura previa obligatoria:**
- `parqueadero-backend/CLAUDE.md` §4-6 (naming, tablas, RLS).
- Skill `supabase-expert` §"Migration Skeleton" y §"RLS Patterns".

📋 **Tareas:**

**Migration `00001_extensions_and_helpers.sql`**
- [x] `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
- [x] Función `set_updated_at()` (trigger genérico).
- [x] Tabla `audit_log` (sin FK a users — preservar log si user se borra).
- [x] Función `audit_log_prevent_mutation()` + 2 triggers BEFORE UPDATE/DELETE (defensa contra service_role).
- [x] Función `write_audit_log()` (TG_TABLE_NAME, SECURITY DEFINER).
- [x] Sequence `invoice_number_seq START 1` + función `assign_invoice_number()` con LPAD 4 dígitos + timezone Bogotá.
- [x] RLS de `audit_log`: ENABLE (sin FORCE para que SECURITY DEFINER funcione). SELECT admin/contador; sin INSERT/UPDATE/DELETE para clientes.

**Migration `00002_initial_schema.sql`** (transacción atómica `BEGIN; ... COMMIT;`)
- [x] 10 tablas operativas en orden de dependencias FK: users → customers → vehicles → tariffs → monthly_plans → cashier_shifts → parking_sessions → invoices → invoice_lines → payments. (audit_log queda en 00001, total 11.)
- [x] Constraints clave:
  - `parking_sessions`: `uq_sessions_active ON (vehicle_plate) WHERE status='active' AND _deleted=FALSE` ✓
  - `cashier_shifts`: `uq_shifts_open_per_user ON (user_id) WHERE status='open' AND _deleted=FALSE` ✓
  - `invoices`: `number TEXT UNIQUE NOT NULL` + `cufe TEXT UNIQUE` ✓
- [x] Índices secundarios (idx_sessions_entry_user_date con `AT TIME ZONE 'America/Bogota'`, idx_plans_active_end, idx_invoices_dian_status, etc.).
- [x] FK con ON DELETE: RESTRICT para datos contables (customers, users, tariffs, shifts), SET NULL para denormalizados (vehicles.owner, sessions.monthly_plan, payments.invoice).
- [x] FK circular `invoices.payment_id ↔ payments.invoice_id` resuelta vía `ALTER TABLE ADD CONSTRAINT` al final.
- [x] `users.id REFERENCES auth.users(id) ON DELETE CASCADE` (mirror pattern para que `auth.uid() = users.id`).

**Migration `00003_rls_policies.sql`**
- [x] `ENABLE + FORCE ROW LEVEL SECURITY` en las 10 tablas operativas.
- [x] Policies por rol según matriz del spec (admin_all + scoped operador + read-only contador).
- [x] `WITH CHECK` en todas las INSERT/UPDATE/ALL.
- [x] **Pendiente para Fase 3**: column-level update de `users` para operador (Postgres RLS no lo soporta; se hace vía trigger BEFORE UPDATE en Fase 3 que verifica role/email/is_active sin cambiar para no-admin).
- [x] **Dependencia**: el claim `role` lo inyecta el JWT custom hook que se implementa en Fase 3. Tests Fase 1 simulan claim manualmente.

**Migration `00004_triggers.sql`**
- [x] `trg_<table>_updated_at` BEFORE UPDATE en las 10 tablas con `updated_at`.
- [x] `trg_<table>_audit` AFTER INSERT/UPDATE/DELETE en `parking_sessions`, `payments`, `invoices`, `monthly_plans`, `cashier_shifts`.
- [x] `trg_invoices_assign_number` BEFORE INSERT en `invoices`.

**Seed (`supabase/seed.sql`)**
- [x] Tarifas default: carro $5.000/h grace 10min cap $30k; moto $2.500/h grace 10min cap $15k; bicicleta $1.000/día.
- [x] Cliente demo (cédula 1000000001, Cliente Demo) + plan mensual ABC123 30 días.
- [x] Admin user: `admin@parqueadero.local` / `admin12345` (autorizado por usuario, dev local). UUID fijo `a0000000-0000-0000-0000-000000000001`. Insertado tanto en `auth.users` (con bcrypt password) como en `public.users` (role='admin').

**Tests SQL (`supabase/tests/rls/`)**
- [x] `01_audit_log_immutable.test.sql`: UPDATE y DELETE en audit_log → SQLSTATE 42501 ✓
- [x] `02_invoice_number_sequence.test.sql`: 5 INSERTs → `FAC-2026-04-28-0001..0005` únicos y formato válido ✓
- [x] `03_parking_sessions_rls.test.sql`: 4 subtests — operador inserta propio ✓ / operador NO puede con uid ajeno ✓ / contador no inserta + lee todo ✓ / admin all ✓
- [x] `run-rls-tests.sh`: bash runner que itera `*.test.sql`, ejecuta con `psql`, grep "FAIL:" o exit_code != 0, reporta totales. Exit 1 si algún test falla. Ejecutable.

✅ **DoD (comandos verificables):**
```bash
cd parqueadero-backend
supabase db reset                         # aplica todas las migrations + seed sin errores
psql "$(supabase status -o json | jq -r .DB_URL)" -f supabase/tests/run-rls-tests.sh
# Verificar RLS habilitado en todas las tablas:
psql ... -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';" \
  | grep -v "true" && echo "FALLA: tabla sin RLS" || echo "OK"
```

🔁 **Prompt de handoff:**
> Backend foundation cerrada. Próxima sesión: **Fase 2 — Core Angular + design system**. Trabajarás solo en `parqueadero-web/`. Invoca skills `angular-architect`, `ui-ux-parqueadero`, `frontend-quality`. Lee `parqueadero-web/CLAUDE.md` §3 (estructura) y skill `ui-ux-parqueadero` §"Design Tokens" antes de empezar.

---

## Fase 2 — Core Angular + design system + shared

🎯 **Goal:** Toda la infra Angular y design system listos para que cualquier feature posterior solo importe utilidades. Shell navegable con placeholders.

🛠️ **Skills:** `angular-architect`, `ui-ux-parqueadero`, `frontend-quality`.

📐 **Specs:**
- `parqueadero-web/specs/components/data-table.spec.md`.
- `parqueadero-web/specs/infrastructure/offline-sync.spec.md` (lectura — implementación real es Fase 8).

📂 **Lectura previa obligatoria:**
- `parqueadero-web/CLAUDE.md` §3 (estructura), §4 (naming), §6 (failures).
- Skill `angular-architect` completo.
- Skill `ui-ux-parqueadero` §"Design Tokens", §"Touch & Density".

📋 **Tareas:**

**`core/`**
- [ ] `core/either/either.ts` — `Either<L,R>` con `fold`, `map`, `flatMap`, `isLeft`, `isRight`, factories `Left`/`Right`. Test 100%.
- [ ] `core/either/failures.ts` — `Failure` base + `ValidationFailure`, `BusinessRuleFailure`, `NotFoundFailure`, `UnauthorizedFailure`, `NetworkFailure`, `ServerFailure`, `CacheFailure`, `ConflictFailure`. Test instanceof.
- [ ] `core/base/base.entity.ts` — id, createdAt, updatedAt.
- [ ] `core/base/usecase.ts` — `abstract class UseCase<P,R>` + `class NoParams`.
- [ ] `core/di/injection-tokens.ts` — registry vacío inicial.
- [ ] `core/services/supabase.service.ts` — wrapper con `client`, manejo `onAuthStateChange`.
- [ ] `core/services/network-info.service.ts` — `isOnline$` (Observable<boolean>) + `isOnline()` (signal).
- [ ] `core/guards/auth.guard.ts` — placeholder funcional (completa en Fase 3).
- [ ] `core/interceptors/error.interceptor.ts` — mapea HTTP errors a `Failure`.

**`shared/`**
- [ ] Models: `pagination.model.ts`, `sort.model.ts`, `filter.model.ts`.
- [ ] Utils: `date.utils.ts` (UTC-5 Bogotá, formato "hace X min", `isSameDayBogota`), `currency.utils.ts` (`formatCOP(cents)` → `$ 5.000`), `plate.utils.ts` (normalize/validate), `uuid.utils.ts`.
- [ ] Validators: `plate.validator.ts`, `nit.validator.ts` (con DV), `colombian-phone.validator.ts`, `positive-number.validator.ts`.
- [ ] `shared/forms/form-error-messages.ts` — mapping `ValidationErrors` → strings ES-CO.
- [ ] Pipes: `currency-cop.pipe.ts`, `time-ago.pipe.ts`, `plate-format.pipe.ts`. Test 100%.

**Design system base**
- [ ] `shared/styles/tokens.scss` — TODOS los tokens del skill `ui-ux-parqueadero` (color, spacing, type, radius, shadow, motion).
- [ ] `shared/styles/reset.scss` (modern-normalize).
- [ ] `shared/styles/global.scss` que importe tokens + reset.
- [ ] Configurar `angular.json`: añadir `global.scss` a styles inicial.
- [ ] Inter + JetBrains Mono **self-hosted** en `src/assets/fonts/`. Preload weight 500 en `index.html`.

**Componentes shared (dumb)**
- [ ] `loading-spinner` (a11y: `role="status"`, `aria-live="polite"`).
- [ ] `error-display` (variantes inline + card).
- [ ] `confirm-dialog` (CDK Dialog, focus trap, restore focus).
- [ ] `status-badge` (input `status: string` → mapea a `--color-status-*`).
- [ ] `plate-input` (autoformatea, valida en blur, monospace).
- [ ] `search-input` (debounce 300ms vía signal/RxJS).
- [ ] `data-table` — implementa la spec; soporta paginación, sort, filter, 5 estados (loading/empty/error/offline/success). Container query para responsive.
- [ ] `offline-banner` (sticky top, suscrito a `NetworkInfoService.isOnline$`, copy ES del skill `ui-ux-parqueadero`).

**Shell de la app**
- [ ] `app.component.ts` con header, nav lateral, `<router-outlet>`, `<app-offline-banner>`.
- [ ] `app.routes.ts` con lazy-loads para: `/auth`, `/parking`, `/monthly-plans`, `/invoicing`, `/payments`, `/cashier`, `/customers`, `/reports`. Cada uno apunta a `<feature>.routes.ts` con un `placeholder.page.ts` que muestra "En construcción — fase X".
- [ ] `app.config.ts` — providers globales (router, animations, HTTP, Supabase factory).

✅ **DoD:**
```bash
cd parqueadero-web
npm run lint                             # sin errores
npm test -- --watch=false                # 100% pasa, cobertura pipes/utils 100%
npm run build                            # bundle inicial < 250kB gzipped
# Smoke manual:
npm start &
# Verifica en navegador http://localhost:4200:
#  - Shell se ve con tokens aplicados (no estilos default Angular).
#  - Navegación a /parking, /reports, etc. carga lazy (Network tab).
#  - DevTools "Offline" → aparece banner amarillo con copy correcto.
#  - Lighthouse a11y >= 95 en localhost:4200.
```

🔁 **Prompt de handoff:**
> Core Angular y design system listos. Próxima sesión: **Fase 3 — Auth**. Toca AMBOS subproyectos (JWT hook en backend + login en web). Invoca skills `supabase-expert` y `angular-architect`. Antes de codear, **CREA** los specs `parqueadero-web/specs/features/auth/{login,logout,restore-session}.spec.md` y CONFIRMA con el usuario que reflejan el comportamiento esperado.

---

## Fase 3 — Auth (cross-cutting)

🎯 **Goal:** Login funcional, sesión persistente, claim `role` en JWT, guards aplicados, RLS validada end-to-end con tokens reales.

🛠️ **Skills:** `supabase-expert`, `angular-architect`.

📐 **Specs:**
- A **CREAR primero**: `parqueadero-web/specs/features/auth/login.spec.md`, `logout.spec.md`, `restore-session.spec.md`. CONFIRMAR con el usuario antes de codear.
- `parqueadero-backend/specs/rls-policies.spec.md` (matriz por rol) — verificar que sigue vigente.

📂 **Lectura previa:**
- `parqueadero-web/CLAUDE.md` §2.5 (Repository Pattern), §2.7 (DI).
- Supabase docs: Auth hooks (custom_access_token_hook).

📋 **Tareas:**

**Backend**
- [ ] Migration `00005_auth_jwt_hook.sql` — función `custom_access_token_hook(event jsonb) RETURNS jsonb` que lee `users.role` por `auth.uid()` y lo añade al claim.
- [ ] Activar el hook (`supabase/config.toml` o Studio).
- [ ] Test SQL: insertar user admin, llamar el hook con JSON simulado, asertar que retorna `role: 'admin'`.
- [ ] (Opcional) Edge Function `set-user-role` admin-only para rotar roles.

**Web — feature `auth`**
- [ ] Specs creados y aprobados (no avanzar sin esto).
- [ ] `domain/entities/user.entity.ts`.
- [ ] `domain/repositories/auth.repository.ts` (login, logout, getCurrentUser, observeAuthChanges).
- [ ] `domain/usecases/login.usecase.ts`, `logout.usecase.ts`, `restore-session.usecase.ts`.
- [ ] `data/datasources/auth-remote.datasource.ts`.
- [ ] `data/repositories/auth.repository.impl.ts`.
- [ ] `presentation/pages/login.page.ts` (smart) + `presentation/forms/auth.forms.ts`.
- [ ] `core/services/auth-state.service.ts` con signals: `currentUser`, `role`, `isAuthenticated`.
- [ ] `core/guards/auth.guard.ts` — completar (redirect a `/auth/login`).
- [ ] `core/guards/role.guard.ts` — factory `requireRole('admin')` `CanActivateFn`.

**Tests**
- [ ] `login.usecase.spec.ts`: happy + 4 failures (credenciales malas, network, server, user inactivo).
- [ ] Re-correr `tests/rls/*.sql` con tokens reales emitidos por Supabase Auth → todos pasan.

✅ **DoD:**
```bash
# Backend
cd parqueadero-backend && supabase db reset
# Crea usuario admin de prueba
supabase functions invoke ...    # o Studio
# Inspecciona JWT
curl -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -d '{"email":"...","password":"..."}' \
  | jq -r .access_token | cut -d. -f2 | base64 -d | jq .role
# debe imprimir "admin"

# Web
cd parqueadero-web && npm test -- --watch=false
# Manual:
# 1) Login admin → puede entrar a /admin/*.
# 2) Login operador → /admin/* redirige.
# 3) Refresh página → sesión persiste.
# 4) Logout → todas las rutas protegidas redirigen.
```

🔁 **Prompt de handoff:**
> Auth completa y RLS validada con tokens reales. Próxima sesión: **Fase 4.A — Parking entrada**. Lee TODOS los specs en `parqueadero-web/specs/features/parking/` y `parqueadero-web/specs/components/vehicle-entry-form.spec.md`. Skills: `angular-architect`, `supabase-expert`, `ui-ux-parqueadero`.

---

## Fase 4 — Parking (vertical slice)

🎯 **Goal:** Operario registra entrada, ve sesiones activas, registra salida con cálculo correcto. Es el corazón del producto.

🛠️ **Skills:** `angular-architect`, `supabase-expert`, `ui-ux-parqueadero`, `frontend-quality`.

📐 **Specs (todas son lectura obligatoria):**
- `parqueadero-web/specs/features/parking/register-vehicle-entry.spec.md`
- `parqueadero-web/specs/features/parking/register-vehicle-exit.spec.md`
- `parqueadero-web/specs/features/parking/calculate-parking-fee.spec.md`
- `parqueadero-web/specs/features/parking/get-active-sessions.spec.md`
- `parqueadero-web/specs/features/parking/search-vehicle-by-plate.spec.md`
- `parqueadero-web/specs/components/vehicle-entry-form.spec.md`
- `parqueadero-web/specs/components/active-sessions-table.spec.md`

Subdivide en 3 sub-fases. Cada una es **una sesión separada** con su entrada en `sessions/`.

### Fase 4.A — Entrada

📋 **Tareas:**
- [ ] Entities: `parking-session.entity.ts`, `vehicle.entity.ts`, `tariff.entity.ts`.
- [ ] Repository abstract con SOLO `registerEntry`, `getActiveSessionByPlate` (resto en 4.B).
- [ ] UseCases: `search-vehicle-by-plate`, `register-vehicle-entry` (validación, no-duplicada, lookup mensualidad, insert).
- [ ] Models + Mappers (snake_case ↔ camelCase).
- [ ] Datasources: abstract + remote (Supabase) + local (placeholder, real en Fase 8).
- [ ] Repository impl.
- [ ] `parking.forms.ts` con `createEntryForm`.
- [ ] `vehicle-entry-form.component.ts` (dumb).
- [ ] `operator-dashboard.page.ts` (smart, orquesta UseCases).
- [ ] DI: tokens + registro en `parking.routes.ts` providers.
- [ ] Tests: `register-vehicle-entry.usecase.spec.ts` con happy path + los 5 edge cases del spec; component test del form.

✅ **DoD parcial:**
- Operario registra `ABC123` carro → aparece en BD `status='active'`.
- Reintento registra → toast con mensaje del `BusinessRuleFailure`.
- Si tiene mensualidad activa → badge violeta antes del submit.
- `npm test` 100%.

### Fase 4.B — Salida + cobro

📋 **Tareas:**
- [ ] UseCase `calculate-parking-fee` (pure, sin repo): grace minutes, daily cap, mensualidad → `{amount_cents, breakdown}`.
- [ ] UseCases `get-active-sessions`, `register-vehicle-exit` (orquesta calc + insert payment + update session).
- [ ] Repository: añadir `getActiveSessions(filter, pagination, sort)`, `registerExit`.
- [ ] `active-sessions-table.component.ts` (consume `data-table` shared).
- [ ] `vehicle-exit-dialog.component.ts` (full-screen mobile, layout del skill `ui-ux-parqueadero`).
- [ ] `parking.forms.ts`: `createExitForm`.
- [ ] Tests `calculate-parking-fee.usecase.spec.ts`: ≥ 8 casos (grace, cap, mensual, transición de día UTC-5, vehículo sin tarifa).
- [ ] Realtime opcional: suscribir tabla activa a Supabase Realtime para refresh automático.

✅ **DoD parcial:**
- Cierre de sesión efectivo → `payments` insertado, `parking_sessions.status='completed'`.
- Cálculo cubre 4 casos del spec con tests.
- Lighthouse perf ≥ 90 en `/parking/dashboard`.

### Fase 4.C — Mensualidades en línea

📋 **Tareas:**
- [ ] UseCase `check-monthly-plan` (input plate → plan activo si existe).
- [ ] Integrar en `register-vehicle-entry.usecase.ts` para auto-asociar `monthly_plan_id`.
- [ ] UI: badge violeta en tabla y formulario.
- [ ] Tests: plan vencido, próximo a vencer (3 días), activo.

✅ **DoD Fase 4 completa:**
- Demo end-to-end: login → 3 entradas (1 con mensualidad) → tabla activa → 3 salidas → datos coherentes.
- Cobertura UseCases ≥ 90%.
- Acta de revisión spec-vs-código en la sesión final.

🔁 **Prompt de handoff:**
> Parking vertical completo. Próxima sesión: **Fase 5 — Catálogos**. Empezarás creando los specs (no existen aún) en `parqueadero-web/specs/features/{tariffs,vehicles,customers,monthly-plans}/*.spec.md`. CONFIRMA cada spec con el usuario antes de codear su feature.

---

## Fase 5 — Catálogos (admin CRUD)

🎯 **Goal:** Admin gestiona tarifas, vehículos recurrentes, clientes, planes mensuales. Operador los lee.

🛠️ **Skills:** `angular-architect`, `supabase-expert`, `ui-ux-parqueadero`.

📐 **Specs:** **a crear** (no existen). Por cada catálogo (tariffs, vehicles, customers, monthly-plans), crea 4 specs: `list-{x}.spec.md`, `create-{x}.spec.md`, `update-{x}.spec.md`, `deactivate-{x}.spec.md`. CONFIRMA con el usuario antes de codear.

📋 **Tareas (template por cada catálogo, hacer 4 catálogos):**
- [ ] Specs creados y aprobados.
- [ ] Entity, repository abstract, UseCases (list, create, update, deactivate — soft delete, NO hard).
- [ ] Models, mappers, datasources, repo impl.
- [ ] Forms service, list page (usa `data-table`), edit dialog, delete = mark `_deleted=true`.
- [ ] Tests por cada UseCase.

**Específico monthly-plans:**
- [ ] Edge Function `renew-monthly` — cron diario (Supabase pg_cron o GH Actions), renueva planes con `auto_renew=true` que vencieron ayer.
- [ ] Status computado: `expiring` (≤ 5 días), `expired`, `active`.

✅ **DoD:**
- Admin crea tarifa → operador la usa de inmediato (refresh manual o realtime).
- Soft delete: tarifa "deactivated" no aparece en formulario de entrada pero sí en históricos.
- `supabase functions invoke renew-monthly` corre en local sin error.

🔁 **Prompt de handoff:**
> Catálogos admin listos. Próxima sesión: **Fase 6 — Cierre de caja + payments**. Skills: `angular-architect`, `supabase-expert`. CREA primero `parqueadero-web/specs/features/cashier/{open-shift,close-shift,reconcile}.spec.md` y `parqueadero-web/specs/features/payments/{register-payment,list-payments}.spec.md`.

---

## Fase 6 — Cierre de caja & payments

🎯 **Goal:** Operario abre/cierra turno, registra pagos sueltos, cuadra caja.

🛠️ **Skills:** `angular-architect`, `supabase-expert`.

📐 **Specs:** a crear (no existen).

📋 **Tareas:**
- [ ] Specs (5) creados y aprobados.
- [ ] Verificar que migration de Fase 1 incluye `uq_shifts_open_per_user` (si no, crear migration `00006_shifts_unique.sql`).
- [ ] UseCases `open-shift` (con cash inicial), `close-shift` (con cash contado, calcula diferencia, requiere justificación si `|diff| > $5000`), `reconcile-shift` (pure, totaliza payments por método).
- [ ] `cashier-shift.page.ts` con apertura, vista en curso, cierre.
- [ ] Guard `requireOpenShift` para rutas `/parking/*` del operador (toast "Abre tu turno primero").
- [ ] Tests: cierre exacto, sobrante, faltante, intento de doble apertura.

✅ **DoD:**
- Turno completo (abrir → 5 entradas/salidas mix efectivo+tarjeta → cerrar) sin errores.
- Cuadre con diferencia muestra warning bloqueante hasta justificar.

🔁 **Prompt de handoff:**
> Cierre de caja listo. Próxima sesión: **Fase 7 — Reportes** (paralelizable con Fase 8 si el usuario abre dos chats). Skill clave: `supabase-expert` para views, `angular-architect` para UI. CREA specs en `parqueadero-web/specs/features/reports/`.

---

## Fase 7 — Reportes

🎯 **Goal:** Admin/contador ven ingresos por período, vehículos atendidos, ranking operadores, exportable a CSV.

🛠️ **Skills:** `supabase-expert`, `angular-architect`.

📐 **Specs:** a crear (`daily.spec.md`, `weekly.spec.md`, `monthly.spec.md`, `by-operator.spec.md`, `by-vehicle-type.spec.md`, `export-csv.spec.md`).

📋 **Tareas:**
- [ ] Specs creados.
- [ ] Migration `00007_reporting_views.sql`: views `v_revenue_daily`, `v_sessions_by_type`, `v_operator_performance`. Considerar materializadas si hot path.
- [ ] Edge Function `report-export` (admin-only) → genera CSV server-side, sube a Storage, retorna URL firmada.
- [ ] Domain: `report.repository.ts` + UseCases por reporte.
- [ ] Pages en `features/reports/presentation/pages/` con `data-table` + filtros (rango, tipo, operador).
- [ ] Charts: opcional. Mínimo viable = tablas con totales.
- [ ] Tests: totales del seed cuadran con suma manual.

✅ **DoD:**
- Reporte diario cuadra con suma manual del seed.
- CSV de mes con > 1.000 filas exporta sin timeout.
- Operador NO ve `/reports` (guard bloquea, RLS también).

🔁 **Prompt de handoff:**
> Reportes listos. Próxima sesión: **Fase 8 — Offline hardening**. Es la fase técnicamente más arriesgada (PowerSync + conflictos). Lee `parqueadero-web/specs/infrastructure/offline-sync.spec.md` Y la documentación de PowerSync. Skill clave: `angular-architect`, `frontend-quality`.

---

## Fase 8 — Offline hardening (PowerSync)

🎯 **Goal:** App funciona offline para flujo crítico (entrada/salida/ver activas). Sync transparente al volver red.

🛠️ **Skills:** `angular-architect`, `frontend-quality`.

📐 **Specs:**
- `parqueadero-web/specs/infrastructure/offline-sync.spec.md` — actualizar con política de conflictos definida.
- Specs de features afectadas: añadir sección "Comportamiento offline" donde aplique.

📋 **Tareas:**
- [ ] Configurar PowerSync: schema mirror, sync rules (operador sincroniza solo sus sesiones del día y catálogos).
- [ ] `core/services/powersync.service.ts` — wrapper sobre `@journeyapps/powersync-sdk`.
- [ ] Reescribir `*-local.datasource.ts` con queries SQLite reales (reemplazar placeholders).
- [ ] Política de conflictos:
  - Catálogos (tarifas, planes): **server-wins** silencioso.
  - Sesiones operativas: **client-wins** + entrada en `audit_log`.
  - Documentar en spec.
- [ ] `repository.impl.ts`: si online → write-through (remote → mirror local); si offline → local + queue.
- [ ] `SyncStatusService`: signal `pendingSync()`, banner muestra "N operaciones pendientes".
- [ ] E2E: 1 hora offline simulado, 30 ops → online → verificar que todas suben sin pérdida ni duplicado.

✅ **DoD:**
- Test e2e offline → online sin pérdida.
- Conflicto provocado (tarifa cambiada server-side mientras operador offline) → server-wins, operador ve cambio al sincronizar.
- Sync de orden correcto: entrada offline + salida offline → al sincronizar llegan en orden temporal.

🔁 **Prompt de handoff:**
> Offline robusto. Próxima sesión: **Fase 9 — Invoicing + DIAN stub**. CRÍTICO: el contrato JSON del stub debe ser idéntico al que tendrá `dian-fe-service` real. Antes de codear, REVISA `dian-fe-service/specs/emit-invoice.spec.md` para alinear el shape de respuesta.

---

## Fase 9 — Invoicing UI + Edge Function `request-invoice` con stub DIAN

🎯 **Goal:** Operario emite factura al cerrar venta. Edge Function asigna número y llama a stub que simula DIAN. Cuando `dian-fe-service` exista, solo cambia URL.

🛠️ **Skills:** `supabase-expert`, `angular-architect`.

📐 **Specs:**
- A crear: `parqueadero-web/specs/features/invoicing/{request-invoice,reissue-invoice,view-invoice}.spec.md`.
- A crear: `parqueadero-backend/specs/edge-functions/request-invoice.spec.md` con sección "stub vs real DIAN" que documente el contrato JSON exacto.
- Lectura: `dian-fe-service/specs/emit-invoice.spec.md` para alinear shape.

📋 **Tareas:**

**Backend**
- [ ] Specs creados y revisados (alinear con specs de DIAN).
- [ ] Stub: `supabase/functions/_shared/dian_stub.ts` retorna `{cufe: 'STUB-<uuid>', dian_status: 'accepted', xml_url: null, pdf_url: null, issued_at: <ISO>}` con MISMA forma que respuesta real.
- [ ] Edge Function `request-invoice`: valida JWT, asigna número (trigger ya existe), inserta en `invoices`, llama stub o servicio real según `DIAN_FE_SERVICE_URL` env (si vacía → stub).
- [ ] Storage bucket `invoices/` creado, policy admin-only read.
- [ ] Variable env documentada en `.env.example`: `# DIAN_FE_SERVICE_URL=  # vacío usa stub local`.

**Web — feature `invoicing`**
- [ ] Specs (3) creados.
- [ ] Entity, repository abstract, UseCases (`request-invoice`, `reissue-invoice`, `get-invoice`).
- [ ] Datasource llama Edge Function (no a tabla directamente).
- [ ] UI: botón "Emitir factura" en dialog de salida (Fase 4.B).
- [ ] Página detalle factura con CUFE, estado DIAN, botones de descarga (deshabilitados si stub).
- [ ] Tests con Edge Function mockeado.

✅ **DoD:**
- Cerrar sesión → emitir factura → BD muestra `dian_status='accepted'`, `cufe='STUB-...'`.
- Toggle env var (stub ↔ url externa) sin tocar código web.
- Spec deja claro qué cambia cuando se conecte real.

🔁 **Prompt de handoff:**
> Invoicing con stub listo. Próxima sesión: **Fase 10 — QA y deploy**. Skills: `frontend-quality`, `supabase-expert`. PIDE al usuario las credenciales de Supabase prod, dominio, y Sentry DSN ANTES de empezar.

---

## Fase 10 — QA, hardening, deploy productivo

🎯 **Goal:** App en producción, monitoreada, con runbook de operación.

🛠️ **Skills:** `frontend-quality`, `supabase-expert`.

📐 **Specs:** revisar todos para vigencia.

📋 **Tareas:**

**Antes de empezar — pedir al usuario:**
- Credenciales Supabase prod (project ref, service-role key — manejar con cuidado).
- Dominio + DNS configurable.
- Cuenta Vercel/Netlify con permisos.
- Sentry DSN (o decisión de skip Sentry).
- Email del admin productivo.

**Tareas:**
- [ ] Suite e2e Playwright cubre 3 flujos críticos: login operador + ciclo entrada/salida; admin gestiona catálogo; cierre de caja con cuadre.
- [ ] Lighthouse audit en producción: a11y ≥ 95, perf ≥ 90, best-practices ≥ 95, PWA ≥ 90.
- [ ] Self-pen-test: intentar bypassar RLS con curl + JWT manipulado (cambiar `role` claim) → debe fallar.
- [ ] PWA install testing en Android Chrome y iOS Safari (manual; reporta resultado).
- [ ] Configurar Supabase prod separado de dev: `supabase link --project-ref <prod>`, `supabase db push --linked`, seed productivo (sin admin de dev).
- [ ] Deploy web a Vercel/Netlify con env vars de prod.
- [ ] Configurar dominio + HTTPS (cert auto).
- [ ] Logging: Sentry web + Supabase logs.
- [ ] Alertas: caída Edge Function, error rate > 1% en 5 min.
- [ ] Backup verification: descargar backup Supabase, restaurar local, smoke test.
- [ ] **Runbook de operación** (`docs/runbook.md`): reset password, cambiar role, reabrir shift cerrado, troubleshoot común.
- [ ] **Plan de rollback**: snapshot pre-deploy, comandos para revertir migration.

✅ **DoD:**
- App accesible en URL pública con HTTPS.
- Operador real (no dev) usa la app 1 día sin incidentes graves.
- Dashboard de monitoreo muestra métricas (req/s, error rate, p95).
- Runbook completo y validado.

🔁 **Prompt de handoff (cierre del proyecto core):**
> Deploy productivo listo. **Plan v2.0 cerrado.** Próximo trabajo: planificar `dian-fe-service` (separado). Iniciar con un nuevo `PLAN-DIAN.md` o sub-plan; las specs ya existen en `dian-fe-service/specs/`.

---

## Trabajo transversal (todas las fases)

- **Specs siempre vivos.** Cualquier cambio de comportamiento → actualizar spec antes que código. Documentar en la sesión.
- **Bitácora `sessions/` por sesión.** Mínimo: objetivos, avance, decisiones, next steps.
- **Tests acompañando.** Sin "fase de testing al final"; el testing es por fase. La Fase 10 solo añade e2e + auditoría.
- **Self-review pre-cierre de fase**: invoca skill `simplify` para revisar código nuevo y eliminar reuso/refactor obvios.
- **Si descubres una regla nueva del sistema**: va al CLAUDE.md correspondiente (raíz o sub), no al PLAN ni a la sesión.

---

## Estrategia de testing

| Capa | Tipo | Cuándo |
|---|---|---|
| UseCase (domain) | Unit puros, mocks de repository | Misma sesión que el UseCase |
| Repository (data) | Integración con datasource real (Supabase local) o mock | Misma sesión que el repo |
| Component (presentation) dumb | TestBed: render, inputs, outputs | Misma sesión que el componente |
| Page (smart) | TestBed con UseCases mockeados | Misma sesión que la page |
| RLS (backend) | SQL scripts en `supabase/tests/rls/` con `SET LOCAL request.jwt.claims` | Cada migration que toca RLS |
| Migration (backend) | `supabase db reset` + smoke queries | Cada migration |
| E2E | Playwright contra dev | Fase 10 + tras merges grandes |

**Cobertura objetivo:** UseCases 90 %+, Repositories 70 %+, Components 50 %+ (críticos 80 %+), util/pipes 100 %.

---

## Señales de riesgo (vigílalas durante el trabajo)

| Señal | Qué hacer |
|---|---|
| Test de RLS sale "PASS" pero no probó el role esperado | Re-leer el test; los `SET LOCAL request.jwt.claims` fallan silencioso si el JSON es inválido |
| PowerSync conflict resolution diferente entre dev y prod | Replicar conflicto en local con misma data antes de avanzar |
| JWT sin claim `role` después de implementar el hook | Verificar que `auth.hook.access_token` está activado en `config.toml` y reiniciar `supabase` |
| Cálculo de tarifa difiere por minutos cerca de medianoche | Confirmar `AT TIME ZONE 'America/Bogota'` en query y `date-fns-tz` en cliente |
| Stub DIAN con shape distinto al spec real | Comparar JSON keys con `dian-fe-service/specs/emit-invoice.spec.md` ANTES de cerrar Fase 9 |
| Supabase Auth con bug → todos parecen operador | Test JWT como DoD obligatorio Fase 3 |
| Bundle Angular crece > 350kB | `npm run analyze`, identifica lib pesada, considera lazy o reemplazo |

---

## Cuándo entra `dian-fe-service` (referencia futura)

Este plan **no construye DIAN**, pero deja preparado:

1. Tabla `invoices` con `dian_status`, `cufe`, `dian_xml_url`, `dian_pdf_url` ya existe (Fase 1).
2. Edge Function `request-invoice` con interfaz idéntica al servicio real (Fase 9). Switch = cambiar `DIAN_FE_SERVICE_URL`.
3. Specs de `dian-fe-service` ya escritas y validadas.
4. Storage bucket `invoices/` creado.

Cuando se planifique DIAN, será un `PLAN-DIAN.md` separado con sus propias fases (D1 bootstrap Python · D2 Either · D3 UBL builder · D4 CUFE · D5 XAdES · D6 SOAP · D7 FastAPI · D8 Docker/Fly · D9 switch del Edge Function · D10 QA contra DIAN sandbox).

---

## Estado actual

- [x] **Fase 0** — Bootstrap *(cerrada 2026-04-28, commit `5fd559b`)*
- [x] **Fase 1** — Backend foundation *(cerrada 2026-04-28, commit pendiente)*
- [ ] **Fase 2** — Core Angular + design system
- [ ] **Fase 3** — Auth
- [ ] **Fase 4** — Parking
- [ ] **Fase 5** — Catálogos
- [ ] **Fase 6** — Cierre de caja
- [ ] **Fase 7** — Reportes
- [ ] **Fase 8** — Offline hardening
- [ ] **Fase 9** — Invoicing + DIAN stub
- [ ] **Fase 10** — QA + deploy

**Fase actual:** ✅ Fase 1 cerrada — siguiente: ⏳ Fase 2 (Core Angular + design system + shared).

**Próxima acción del agente:**
1. Crear `sessions/YYYY-MM-DD-fase-2-core-angular.md`.
2. Trabajar SOLO en `parqueadero-web/`. Backend ya cerrado.
3. Invocar skills `angular-architect`, `ui-ux-parqueadero`, `frontend-quality`.
4. Leer `parqueadero-web/CLAUDE.md` §3 (estructura), `parqueadero-web/specs/components/data-table.spec.md`, `parqueadero-web/specs/infrastructure/offline-sync.spec.md`.
5. Construir `core/` (Either, Failures, BaseEntity, UseCase, DI tokens, Supabase service, NetworkInfo) + `shared/` (utils, validators, pipes, dumb components con design tokens) + shell de la app con lazy routes placeholder.
