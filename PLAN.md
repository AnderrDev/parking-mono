# Plan de Trabajo (Claude Code) — `parqueadero-web` + `parqueadero-backend`

**Versión:** 2.0 (reformateado para agentes Claude Code)
**Última actualización:** 2026-04-28
**Alcance:** Solo `parqueadero-web` (Angular PWA) y `parqueadero-backend` (Supabase).
**Fuera de alcance:** `dian-fe-service` se planificará aparte. Este plan deja un **stub** del flujo de facturación electrónica en la Fase 9 para que la integración real se enchufe sin re-arquitectura.

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
| 8 | Offline hardening (PowerSync, conflictos) | ambos | `angular-architect`, `frontend-quality` |
| 9 | Invoicing UI + Edge Function `request-invoice` con **stub DIAN** | ambos | `supabase-expert`, `angular-architect` |
| 10 | QA, hardening, deploy productivo | ambos | `frontend-quality`, `supabase-expert` |

**Camino crítico:** 0 → 1 → 2 → 3 → 4 → 6 → 9 → 10. Las Fases 5, 7, 8 pueden trabajarse en sesiones paralelas si el usuario abre dos chats al mismo tiempo (no es lo común; default = secuencial).

**Fase actual:** ✅ Fase 3 cerrada — siguiente: ⏳ Fase 4 (Parking: entrada/salida/cobro).

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
- [x] **Fase 1** — Backend foundation *(cerrada 2026-04-28, commit `434a354`)*
- [x] **Fase 2** — Core Angular + design system *(cerrada 2026-04-29, commit `88d1afb`)*
- [ ] **Fase 3** — Auth
- [ ] **Fase 4** — Parking
- [ ] **Fase 5** — Catálogos
- [ ] **Fase 6** — Cierre de caja
- [ ] **Fase 7** — Reportes
- [ ] **Fase 8** — Offline hardening
- [ ] **Fase 9** — Invoicing + DIAN stub
- [ ] **Fase 10** — QA + deploy

**Fase actual:** ✅ Fase 2 cerrada — siguiente: ⏳ Fase 3 (Auth: JWT hook backend + login web).

**Próxima acción del agente:**
1. Crear specs `parqueadero-web/specs/features/auth/{login,logout,restore-session}.spec.md` y CONFIRMAR con el usuario antes de codear.
2. Skills: `supabase-expert` (JWT hook) + `angular-architect` (feature auth).
