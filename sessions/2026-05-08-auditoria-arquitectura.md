# Sesión: Auditoría arquitectónica completa del monorepo

**Fecha:** 2026-05-08
**Subproyecto(s):** parqueadero-web, parqueadero-backend, dian-fe-service (congelado), infra
**Estado:** completada (con 4 tareas pendientes de sesión dedicada)

## Objetivos
- [ ] Auditar `parqueadero-web` (Angular 18 PWA): clean architecture, especificaciones vs código, calidad, seguridad, performance.
- [ ] Auditar `parqueadero-backend` (Supabase): migraciones, RLS, Edge Functions, índices, triggers, seguridad.
- [ ] Auditar `dian-fe-service` (Python/FastAPI): estado de congelación + riesgos si se descongela.
- [ ] Revisar infraestructura cross-cutting: CI/CD, secrets, deploy, observabilidad, oportunidades Supabase.
- [ ] Verificar testing pasando (lectura, no ejecución).
- [ ] Generar plan priorizado de remediaciones (P0/P1/P2).

## Avance
- ✅ Web auditada (Explore agent + verificación directa).
- ✅ Backend auditado (migraciones 00001–00016, RLS, EFs, índices, tests SQL).
- ✅ dian-fe-service auditado (estado de congelación y riesgos).
- ✅ Infra cross-cutting auditada (CI/CD, secrets, observabilidad, oportunidades Supabase).
- ✅ 16 tareas creadas con prioridad P0/P1/P2.

## Hallazgos confirmados (post-verificación)
**P0 (1)**
- `parqueadero-web/src/app/features/parking/domain/usecases/print-entry-ticket.usecase.ts:12` importa `TicketRendererService` desde `data/`. Viola regla absoluta de Clean Architecture (domain → data).

**P1 (9)**
1. `00013_siigo_integration.sql:61`: `siigo_cufe TEXT` sin UNIQUE → riesgo de duplicado fiscal.
2. `supabase/functions/request-invoice/index.ts:3,198`: `TAX_RATE=0.19` y `taxCents = amount*0.19` (suma encima, no extrae). Contradice 00016/tax-config.spec.md.
3. `parqueadero-backend/.env.example` no documenta `SIIGO_USERNAME/ACCESS_KEY/PARTNER_ID/PRODUCT_ID_PARKING_HOUR/BASE_URL`.
4. CI/CD ausente (no `.github/workflows/`, no Vercel/Netlify config). Bloquea Fase 10.
5. Observabilidad nula (sin Sentry/OTEL/Logtail). EFs Siigo críticas sin trazas.
6. Sin runbook ni plan de DR/backups.
7. Sin separación dev/staging/prod (Supabase ni Angular).
8. 33 de 54 UseCases sin `.spec.ts` (cobertura desigual; 21 tests existen).
9. `dian-fe-service` no marcado explícitamente como CONGELADO; `CLAUDE.md` aún muestra "PRÓXIMOS PASOS" activos.

**P2 (6)**
- Realtime publication no configurada en `parking_sessions`/`invoices` (specs Siigo S6/S7 la asumen).
- Shared components (`data-table`, `confirm-dialog`, `plate-input`) sin tests.
- `specs/rls-policies.spec.md` desactualizada (menciona hook como "Fase 3 futuro" ya implementado en 00005+00009).
- Sin orquestador monorepo (turbo/pnpm-workspaces).
- MFA no habilitada para admin/contador (Supabase Auth lo soporta).
- PWA `ngsw-config.json` sin `dataGroups` para APIs.

## Lo que está bien (no requiere acción)
- ✅ Either pattern: 0 `throw new` en UseCases (54 archivos).
- ✅ TypeScript strict + strictTemplates + noUncheckedIndexedAccess activos.
- ✅ Naming `kebab-case.tipo.ts` 100% consistente.
- ✅ JWT custom_access_token_hook activo (config.toml:225-227); claim renombrado correctamente a `user_role` en migration 00009 para evitar choque con rol PG.
- ✅ Migraciones sin saltos (00001–00016); sin DDL destructivo de riesgo.
- ✅ RLS robusto + doble defensa en `audit_log` (RLS + trigger anti-mutación).
- ✅ Constraints críticos presentes: `uq_sessions_active`, `uq_shifts_open_per_user`, `cufe` UNIQUE, `internal_number` UNIQUE.
- ✅ `SECURITY DEFINER` con `SET search_path` correcto en todas las funciones.
- ✅ Índices hot path cubiertos (placa, sesiones por turno, polling Siigo, audit_log timeline).
- ✅ Régimen tributario: `00016_tax_config_settings.sql` + `_shared/tax/extract.ts` + uso en `siigo-emit-invoice` correctos (fórmula `base = total/1.19`).
- ✅ `siigo-emit-invoice`: idempotencia por `session_id`, JWT verificado, audit row por intento, retry/timeout vía `siigoFetch()`.
- ✅ 6 tests RLS SQL con matriz role × operación + denegación cross-rol.
- ✅ Sin secrets committeados; `.gitignore` completo.
- ✅ PowerSync `sync-rules.yaml` razonable (operador ve solo su turno + catálogos globales).
- ✅ Bundles Angular dentro de presupuesto (initial 650 kB).
- ✅ Lazy-loading 100% en `app.routes.ts`.

## Decisiones
- Auditoría no destructiva: solo lectura. Ningún cambio aplicado.
- Tests no se ejecutan (memoria `feedback_no_tests`); se valida por estructura + último commit `8ddea81 fix(web): bugs encontrados por tests (214/214 ✅)`.
- Hallazgos quedan como tareas; usuario priorizará cuáles atacar primero.

## Remediaciones aplicadas (2026-05-08)

### P0 — Clean Architecture
- ✅ `parqueadero-web`: nuevo puerto `domain/services/ticket-renderer.port.ts` (abstract class). `data/services/ticket-renderer.service.ts` extiende el puerto. UseCase `print-entry-ticket.usecase.ts` ahora inyecta `TICKET_RENDERER_TOKEN` (no importa de `data/`). Token + provider añadidos en `injection-tokens.ts` y `parking.routes.ts`. `tsc --noEmit` pasa limpio.

### P1 — Backend
- ✅ Migración `00017_siigo_cufe_unique.sql`: índice único parcial sobre `invoices.siigo_cufe WHERE NOT NULL` — defensa explícita contra duplicación de CUFE Siigo.
- ✅ Migración `00018_realtime_publications.sql`: `REPLICA IDENTITY FULL` + `ALTER PUBLICATION supabase_realtime ADD TABLE` para `parking_sessions` e `invoices`. Habilita `observeInvoiceStatus(id)` que asume la spec siigo-status-realtime.
- ✅ `request-invoice/index.ts`: header de DEPRECATION; cómputo de IVA reemplazado por `getTaxConfig() + extractInvoiceAmounts()` (helper compartido `_shared/tax/extract.ts`). Ya no suma IVA encima — alineado con régimen común precio-incluye-IVA. Marcado para borrarse en S9.
- ✅ `.env.example`: agregadas `SIIGO_BASE_URL`, `SIIGO_USERNAME`, `SIIGO_ACCESS_KEY`, `SIIGO_PARTNER_ID`, `SIIGO_PRODUCT_ID_PARKING_HOUR`. `DIAN_FE_SERVICE_URL` marcada como deprecada.

### P1 — Infra
- ✅ `.github/workflows/ci.yml`: pipeline `lint + tsc + build` para web + `deno check` por cada Edge Function + validación sintáctica de migraciones SQL. `dian-fe-service` excluido por congelación. Tests deshabilitados a propósito (memoria `feedback_no_tests` + se habilitan en PR dedicada con karma headless).
- ✅ `docs/runbook.md`: nuevo, con 7 secciones — backups/PITR, reset password, cambio de rol, reabrir turno, retry Siigo, migraciones, troubleshooting (4 casos), rollback web, queries de auditoría rápida.
- ✅ `parqueadero-web/src/environments/environment.staging.ts` nuevo. `angular.json` ahora tiene 3 configurations (production/staging/development) con `fileReplacements`. Script: `ng build --configuration=staging`. Anon key local marcada como demo (no es secret).
- ✅ Telemetría base sin DSN: `core/services/telemetry.service.ts` (signals + buffer) + integrado en `error.interceptor.ts`. Backend: `_shared/logger.ts` (JSON estructurado). Sentry/Datadog se enchufan después con DSN sin tocar call-sites.

### P1 — Otros
- ✅ `dian-fe-service/FROZEN.md` nuevo + banner de congelación al inicio de `dian-fe-service/CLAUDE.md`. Documenta razón, condiciones de descongelación, reglas mientras esté congelado.

### P2
- ✅ `ngsw-config.json`: añadidos `dataGroups`. `supabase-catalogos` (performance, 1h, 200 entries) para tariffs/customers/vehicles/monthly_plans/app_settings. `supabase-mutaciones` (freshness, 5m) para parking_sessions/payments/invoices/cashier_shifts.
- ✅ `specs/rls-policies.spec.md`: actualizada sección "Dependencia: JWT custom claim" — claim renombrado a `user_role` (00009), hook ya implementado en 00005 + 00008. Nota histórica del rename.

## Pendientes — sesión dedicada (no se ejecutan en esta)

| # | Razón |
|---|---|
| #9 — Tests UseCases faltantes (33/54) | Trabajo masivo. Lista priorizada en la tarea: cashier → invoicing → monthly-plans → reports → users → catálogos. Meta 90% UseCases con happy + ≥3 failures. |
| #12 — Tests shared components | Smoke + a11y; mejor tras estabilizar Fase 8 (PowerSync introduce estados nuevos). |
| #14 — pnpm/turborepo | Decisión + refactor invasivo. Beneficio bajo hoy. Postergar hasta cierre Fase 11. |
| #15 — MFA admin/contador | Requiere spec previa + decisión UX. Ver tarea para pasos. |

## Decisiones tomadas
- Auditoría no destructiva: solo lectura.
- Migraciones 00017 y 00018 son aditivas e idempotentes — seguras de aplicar local. Para remoto: requiere `supabase db push --linked` con confirmación del usuario (destructivo formal).
- Tests no se ejecutan (memoria `feedback_no_tests`); se valida con `tsc --noEmit` (verde tras todos los cambios).
- `request-invoice` se mantiene viva pero deprecada y con cómputo de IVA correcto — no se elimina hoy para no romper clientes legacy.

## Bloqueos / Pendientes
- ⏳ Aplicar 00017 y 00018 a BD local: `cd parqueadero-backend && supabase db reset` (recreará todo desde cero) o `psql` directo si se prefiere migración incremental.
- ⏳ Aplicar a remoto: requiere `supabase link --project-ref <REF>` (manual) y luego `supabase db push --linked` (destructivo, requiere confirmación).
- ⏳ DSN Sentry: cuando el usuario lo provea, enchufarlo en `telemetry.service.ts` y en `_shared/logger.ts`.
- ⏳ Secrets de CI (`SUPABASE_*`, `SIIGO_*`) en GitHub Actions.

## Next Steps
- Usuario confirma si quiere aplicar 00017 y 00018 a BD local ahora o en próxima sesión.
- Decidir orden siguiente: Fase 8 (PowerSync) o Fase 11 S2 (siigo schema delta) — ambas listas para arrancar; las P1 de remediación ya no bloquean.
- Próxima sesión específica: tests faltantes (#9 + #12) o MFA (#15) según prioridad.
