# Plan de Trabajo (Claude Code) — `parqueadero-web` + `parqueadero-backend`

**Versión:** 2.0 (reformateado para agentes Claude Code)
**Última actualización:** 2026-04-28
**Alcance:** `parqueadero-web` (Angular PWA), `parqueadero-backend` (Supabase) y, desde la **Fase 11**, la integración con **Siigo** para facturación electrónica (vive en Edge Functions de Supabase).
**Histórico:** `dian-fe-service` (Python directo a DIAN) se desarrolló hasta D8 y quedó **congelado** al adoptar Siigo en la Fase 11.

---

## Protocolo y reglas

Ver `CLAUDE.md` raíz — protocolo lazy, reglas absolutas y skills disponibles están ahí y llegan vía hooks en cada turno.

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
| 8 | Offline hardening (Dexie + outbox, conflictos) | ambos | `angular-architect`, `frontend-quality` |
| 9 | Invoicing UI + Edge Function `request-invoice` con **stub DIAN** | ambos | `supabase-expert`, `angular-architect` |
| 10 | QA, hardening, deploy productivo | ambos | `frontend-quality`, `supabase-expert` |
| ~~11~~ | ~~Facturación electrónica con Siigo~~ — **DESCARTADA** (decisión 2026-05-15) | — | — |

**Camino crítico:** 0 → 1 → 2 → 3 → 4 → 6 → 9 → 10. Las Fases 5, 7, 8 pueden trabajarse en sesiones paralelas si el usuario abre dos chats al mismo tiempo (no es lo común; default = secuencial).

**Fase 11 — DESCARTADA (2026-05-15):** Sin facturación electrónica de terceros (Siigo / proveedores externos). El stub interno y la numeración local de `invoices` se mantienen para registro de venta interno. Si en el futuro se requiere FE DIAN, se replanea desde cero.

**Fase actual:** ✅ Fase 8 cerrada (2026-05-15). Siguiente: ⏳ Fase 10 (QA + Deploy productivo).

---

## Fase 0 — Bootstrap ✅ Completada (2026-04-28)

Git init, `ng new`, `supabase init`, deps, tooling (ESLint/Prettier/PWA/tsconfig strict). Ver `sessions/2026-04-28-fase-0-bootstrap.md`.

---

## Fase 1 — Backend foundation ✅ Completada (2026-04-28)

4 migrations (helpers, schema 11 tablas, RLS, triggers) + seed + tests SQL. Ver `sessions/2026-04-28-fase-1-schema-rls.md`.

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

## Fase 8 — Offline hardening (Dexie + outbox) — ✅ Completada (2026-05-15)

Sprints 0–3 entregaron operación crítica offline para operadores (entrada/salida/pago/turno):
- Dexie como mirror local + outbox FIFO con backoff y idempotencia por `client_op_id`.
- Realtime mantiene mirror fresco (publication extendida a 9 tablas).
- Conflict resolution UI + `BroadcastChannel` multi-tab + stale-write protection (`P0409`).
- Migrations: `00019`, `00020`, `00021`.

Ver sesión: `sessions/2026-05-15-fase-8-offline.md`.

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

## Fase 11 — Facturación electrónica con Siigo

🎯 **Goal:** Reemplazar el stub DIAN (Fase 9) y el camino directo `dian-fe-service` por una integración con **Siigo** (proveedor SaaS que firma XAdES, calcula CUFE y envía a DIAN). El operador emite factura electrónica desde el cierre de venta cuando el cliente la pide; el resto sigue siendo ticket POS interno.

**Decisiones cerradas:**
1. Siigo es **único** proveedor productivo. `dian-fe-service` queda **congelado** (D1–D8 conservados como referencia; D9/D10 nunca se completan).
2. Integración 100 % en **Edge Functions de Supabase (Deno)** — sin nuevo subproyecto.
3. **Numeración dual**: `internal_number` (sigue `nextval_invoices()`, sirve offline / ticket / auditoría) + `siigo_number` (consecutivo fiscal asignado por Siigo).
4. **Cuándo emitir**: solo cuando el cliente lo pide (toggle existente en `vehicle-exit-dialog`). Salidas contra mensualidad NO emiten FE (toggle bloqueado).
5. **Sincronía**: asíncrona. Cajero cierra → invoice queda en `pending` → cron polling cada 30 s actualiza estado en BD; UI refresca via Realtime.
6. **Cliente fiscal**: auto-create on-demand en Siigo si no existe; `siigo_customer_id` se persiste en `customers`.

🛠️ **Skills:** `supabase-expert`, `angular-architect`, `frontend-quality`.

📐 **Specs (a crear primero — regla absoluta):**
- `parqueadero-backend/specs/edge-functions/siigo-emit-invoice.spec.md`
- `parqueadero-backend/specs/edge-functions/siigo-poll-status.spec.md`
- `parqueadero-backend/specs/edge-functions/_shared-siigo-client.spec.md`
- `parqueadero-backend/specs/database-schema-siigo-delta.spec.md`
- `parqueadero-backend/specs/rls-policies-siigo.spec.md`
- `parqueadero-web/specs/features/parking/cashier-fiscal-data-capture.spec.md`
- `parqueadero-web/specs/features/invoicing/siigo-status-realtime.spec.md`
- Actualizar: `request-invoice.spec.md`, `view-invoice.spec.md`, `reissue-invoice.spec.md` en `parqueadero-web/specs/features/invoicing/`.

📂 **Lectura previa:**
- `~/.claude/plans/vamos-a-hacer-una-purring-meadow.md` (plan aprobado)
- `dian-fe-service/CLAUDE.md` (para entender qué se está reemplazando)
- API Siigo: https://developers.siigo.com/docs/siigoapi/

📋 **Sub-fases:**

### S1 — Specs + sandbox + catálogo iniciado
- [ ] Specs de la lista superior creadas y aprobadas.
- [ ] Solicitar credenciales sandbox a `soporteapi@siigo.com`.
- [ ] Pre-cargar productos en Siigo Nube: "Parqueo por hora", "Plan mensual", (opc) "Cobro diario tope".
- [ ] Confirmar costo por documento, rate limit oficial, disponibilidad de webhooks privados.

### S2 — Schema delta + audit + trigger
- [ ] Migration `00013_siigo_integration.sql`:
  - Renombrar `invoices.number → internal_number` (mantiene UNIQUE).
  - Agregar `siigo_id, siigo_number, siigo_status, siigo_observations, siigo_pdf_url, siigo_xml_url, siigo_qr_url, siigo_cufe, siigo_cude, siigo_attempts, siigo_last_attempt_at, siigo_last_error, requested_invoice` a `invoices`.
  - Agregar `siigo_customer_id, siigo_synced_at, siigo_sync_error` a `customers`.
  - Tabla `siigo_invoice_attempts` (append-only, RLS service_role only).
  - Tabla `siigo_auth_tokens` (single-row cache bearer 24 h, RLS service_role only).
  - Función `get_invoices_for_polling(p_limit INT)` `SECURITY DEFINER` con `FOR UPDATE SKIP LOCKED`.
  - Trigger `BEFORE UPDATE/INSERT` que deriva `dian_status` desde `siigo_status` (compatibilidad con queries actuales).
  - Índices `(siigo_status, siigo_attempts) WHERE …`, `(siigo_id) WHERE NOT NULL`.
- [ ] Tests RLS en `tests/rls/04_siigo_audit_immutable.test.sql`, `05_siigo_status_trigger.test.sql`.

### S3 — Auth helper + token cache
- [ ] `supabase/functions/_shared/siigo/auth.ts` — `getSiigoToken()` con cache de 24 h en tabla `siigo_auth_tokens`.
- [ ] `supabase/functions/_shared/siigo/client.ts` — `siigoFetch()` con timeout 28 s, retry simple en 429/5xx, audita en `siigo_invoice_attempts`.
- [ ] `supabase/functions/_shared/siigo/{customer,mapper,types,errors}.ts`.
- [ ] Test manual: invocar `getSiigoToken()` desde una EF temporal con credenciales sandbox; persiste token.

### S4 — Edge Function `siigo-emit-invoice`
- [ ] `supabase/functions/siigo-emit-invoice/index.ts` — verifica JWT, idempotencia por `session_id`, `ensureSiigoCustomer`, `nextval_invoices`, `POST /v1/invoices` con `stamp.send:true`, persiste resultado.
- [ ] Manejo de 4xx/5xx/timeout: invoice queda persistida en `pending`/`Rejected`, polling toma el relevo.
- [ ] Test sandbox: una factura emitida queda en `Stamped` o `pending`; audit row registrado.

### S5 — Edge Function cron `siigo-poll-status`
- [ ] `supabase/functions/siigo-poll-status/index.ts` — `get_invoices_for_polling(20)`, `GET /v1/invoices/{siigo_id}`, mapear a `siigo_status`, backoff `min(intent²×5s, 5min)`.
- [ ] Migration `00014_siigo_polling_cron.sql` con `pg_cron` + `pg_net` (frecuencia 30 s).
- [ ] Setup post-deploy: `ALTER DATABASE postgres SET app.siigo_poll_url = '...'`.
- [ ] Test sandbox: una factura `pending` pasa a `Stamped` sin intervención.

### S6 — UI cashier (toggle + form fiscal + bloqueo plan mensual)
- [ ] `vehicle-exit-dialog.component.{ts,html}`: el toggle `emitInvoice` ya existe; extender con form fiscal inline cuando el cliente seleccionado no tiene `email/name/doc_type/doc_number`. **Bloquear toggle** si la salida se cierra contra mensualidad.
- [ ] `invoice.entity.ts`: renombrar `number → internalNumber`. Agregar `siigoId, siigoNumber, siigoStatus, siigoObservations, siigoPdfUrl, siigoQrUrl, siigoAttempts, siigoLastError, requestedInvoice`. Tipo `SiigoStatus`. Getters `isFinal`, `isStamped`, `canDownloadPdf`, `canReissue`.
- [ ] `invoicing-remote.datasource.ts`: switch `request-invoice → siigo-emit-invoice`. Implementar `observeInvoiceStatus(id)` con Realtime.

### S7 — UI invoices-list con Realtime
- [ ] Página `invoices-list.page` muestra columna "Estado Siigo" con `<app-status-badge>`. Suscripción Realtime refresca filas.
- [ ] Botón "Descargar PDF" deshabilitado salvo `Stamped && siigo_pdf_url !== null`. Botón "Reintentar" solo si `canReissue`.

### S8 — Catálogo Siigo Nube + QA sandbox (manual)
- [ ] Productos, formas de pago, tipo de documento, vendedor verificados en portal Siigo Nube.
- [ ] 5 facturas sandbox emitidas y descargadas. Health-check: `GET /v1/products/<id>` por cada producto configurado.

### S9 — Production cutover + deprecation
- [ ] `supabase functions delete request-invoice`. Remover `DIAN_FE_SERVICE_URL` del `.env.example` y de `supabase secrets`.
- [ ] Marcar `dian-fe-service/PLAN-DIAN.md` como **CONGELADO**. Conservar D1–D8 en repo como referencia.

✅ **DoD Fase 11 completa:**
- 10 facturas reales emitidas en producción Siigo, todas en `Stamped`.
- Cajero cierra venta con FE en < 3 s percibidos (asíncrono); UI refresca cuando Siigo confirma.
- Salida contra mensualidad NO genera FE (toggle bloqueado, no hay invoice creado).
- Modo offline encola FE en `queued_offline` y emite al reconectar (coordinado con Fase 8).
- `request-invoice` EF eliminada; `dian_status` se sigue alimentando desde `siigo_status` vía trigger.

🔁 **Prompt de handoff:**
> Siigo en producción, `dian-fe-service` congelado. Próxima sesión opcional: planear notas crédito (`siigo-emit-credit-note`) o vista admin de auditoría `siigo_invoice_attempts`.

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

## Cuándo entra `dian-fe-service` (histórico — **CONGELADO**)

`dian-fe-service` (Python/FastAPI con UBL + XAdES + CUFE + SOAP DIAN directo) llegó hasta D8 (107 tests, Docker build OK) pero **queda congelado** porque la Fase 11 lo reemplaza con Siigo. D9/D10 nunca se completan. El código se conserva en repo como referencia o contingencia.

La integración de facturación electrónica vive ahora en la Fase 11 (Siigo) — ver sección arriba. La tabla `invoices` se preserva con el schema delta de S2 (campos `siigo_*` agregados; `dian_status` se deriva via trigger desde `siigo_status` para no romper queries históricas).

---

## Estado actual

- [x] **Fase 0** — Bootstrap *(cerrada 2026-04-28)*
- [x] **Fase 1** — Backend foundation *(cerrada 2026-04-28)*
- [x] **Fase 2** — Core Angular + design system *(cerrada 2026-04-29)*
- [x] **Fase 3** — Auth *(cerrada 2026-04-29)*
- [x] **Fase 4** — Parking (entrada/salida/mensualidades) *(cerrada 2026-04-29)*
- [x] **Fase 5** — Catálogos (tarifas, vehículos, clientes, planes) *(cerrada 2026-04-29)*
- [x] **Fase 6** — Cierre de caja & payments *(cerrada 2026-04-29)*
- [x] **Fase 7** — Reportes *(cerrada 2026-04-29)*
- [x] **Fase 8** — Offline hardening (Dexie + outbox) *(cerrada 2026-05-15)*
- [x] **Fase 9** — Invoicing + DIAN stub *(cerrada 2026-04-29)*
- [ ] **Fase 10** — QA + deploy
- ❌ **Fase 11** — Facturación electrónica de terceros — **DESCARTADA (2026-05-15)** por decisión del usuario. Trabajo previo (S1–S5) queda en repo pero no se completa.

**Fase actual:** ✅ Fase 8 cerrada (2026-05-15). Siguiente: ⏳ Fase 10 (QA + Deploy productivo).

**Próxima acción del agente:**
1. Avanzar Fase 10 (Deploy productivo): E2E Playwright, Lighthouse, runbook completo, Sentry, deploy a hosting + Supabase prod.
2. Aplicar migrations `00019`, `00020`, `00021` al backend productivo (parte de Fase 10).
3. Coordinar QA manual offline (ver `parqueadero-web/specs/infrastructure/qa-manual-fase-8.md`).
