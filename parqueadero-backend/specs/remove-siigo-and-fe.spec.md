# Spec: Eliminación de Siigo y Facturación Electrónica DIAN del proyecto

**Estado:** propuesto (pendiente OK del usuario)
**Fecha:** 2026-05-20
**Decisión:** El alcance del producto no incluye facturación electrónica de terceros (Siigo) ni emisión directa a DIAN. El parqueadero opera como POS con **ticket interno numerado** (tabla `invoices` con `internal_number`) sin firma XAdES, sin CUFE, sin envío a DIAN, sin Siigo.

## Alcance (variante elegida)

**Solo Siigo + DIAN. Conservar `invoices` como ticket interno.**

- `invoices`, `invoice_lines`, sequence `invoice_number_seq` y la EF `request-invoice` se mantienen.
- Todas las columnas `siigo_*` y `dian_*` se eliminan.
- El feature `parqueadero-web/src/app/features/invoicing/` se conserva pero limpia de DIAN/Siigo.
- `dian-fe-service/` se elimina del monorepo.
- Migraciones siigo (00013, 00014, 00017, 00021_drop_siigo) se eliminan del árbol y el `schema_migrations` remoto se resetea.
- Bitácoras `2026-05-0{1,2}-siigo-*.md` y `2026-05-01-dian-fe-service-plan.md` se borran.

## Pre-condiciones

- 0 facturas en remoto (`invoices` rows = 0). No hay datos productivos que perder.
- 0 EF desplegadas en remoto (`list_edge_functions` → vacío). No hay endpoints en uso.
- Cron `siigo-poll-every-30s` ya está desprogramado (2026-05-15).
- Branch actual: `dev`. Cambios se commitean en `dev`.

## Inventario afectado

### parqueadero-backend (SQL)
**Drops en remoto** (orden importa):
1. `DROP TABLE public.siigo_invoice_attempts CASCADE;` (0 rows)
2. `DROP TABLE public.siigo_auth_tokens CASCADE;` (0 rows)
3. `ALTER TABLE public.invoices DROP COLUMN siigo_id, siigo_number, siigo_status, siigo_observations, siigo_pdf_url, siigo_xml_url, siigo_qr_url, siigo_cufe, siigo_cude, siigo_attempts, siigo_last_attempt_at, siigo_last_error;` (12 cols)
4. `ALTER TABLE public.invoices DROP COLUMN dian_status, dian_cufe, dian_xml_url, dian_pdf_url;` (4 cols)
5. `ALTER TABLE public.customers DROP COLUMN siigo_synced_at, siigo_customer_id, siigo_sync_error;` (3 cols)
6. `DROP FUNCTION IF EXISTS public.sync_dian_from_siigo() CASCADE;` (trigger function)
7. `DROP FUNCTION IF EXISTS public.siigo_attempts_prevent_mutation() CASCADE;`
8. Publicar realtime: `ALTER PUBLICATION supabase_realtime DROP TABLE siigo_invoice_attempts, siigo_auth_tokens;` (si existen)
9. `cron.unschedule('siigo-poll-every-30s')` idempotente (ya hecho).

**Archivos a eliminar** (`parqueadero-backend/supabase/`):
- `migrations/00013_siigo_integration.sql`
- `migrations/00014_siigo_polling_cron.sql`
- `migrations/00017_siigo_cufe_unique.sql`
- `migrations/00021_drop_siigo.sql`
- `functions/siigo-emit-invoice/` (carpeta)
- `functions/siigo-poll-status/` (carpeta)
- `functions/_shared/siigo/` (carpeta, 7 archivos)
- `tests/rls/04_siigo_audit_immutable.test.sql`
- `tests/rls/05_siigo_status_trigger.test.sql`
- `tests/rls/06_siigo_auth_tokens.test.sql`

**Archivos a editar**:
- `migrations/00002_initial_schema.sql` — quitar columnas `dian_status, dian_cufe, dian_xml_url, dian_pdf_url` de la definición de `invoices` y triggers asociados (si aplica).
- `migrations/00003_rls_policies.sql` — verificar que no haya policies en tablas siigo.
- `migrations/00004_triggers.sql` — quitar trigger `sync_dian_from_siigo` (se introduce en 00013, pero verificar).
- `migrations/00018_realtime_publications.sql` — quitar `siigo_*` del `ALTER PUBLICATION` si las menciona.
- `migrations/00019_realtime_offline_mirror.sql` — idem.
- `specs/database-schema.spec.md` — quitar sección `siigo_*` y `dian_*` en `invoices` + sección `customers.siigo_*`.
- `specs/rls-policies.spec.md` — quitar policies en tablas siigo.
- `CLAUDE.md` (backend) — quitar referencias a Siigo/DIAN/dian-fe-service.

**Renumeración** (post-eliminación):
| Antes | Después |
|---|---|
| 00013_siigo_integration | ❌ |
| 00014_siigo_polling_cron | ❌ |
| 00015_monthly_tariff_unit | 00013 |
| 00016_tax_config_settings | 00014 |
| 00017_siigo_cufe_unique | ❌ |
| 00018_realtime_publications | 00015 |
| 00019_realtime_offline_mirror | 00016 |
| 00020_outbox_idempotency | 00017 |
| 00021_drop_siigo | ❌ |
| 00021_stale_write_protection | 00018 |
| 00023_tariff_tiered_pricing | 00019 |
| 00024_tariff_sync_legacy_columns | 00020 |
| 00025_tariff_tiered_not_null | 00021 |

Total final: 21 migraciones consecutivas (00001–00021).

### parqueadero-web (Angular)
**Archivos a editar** (quitar campos DIAN/Siigo):
- `src/app/features/invoicing/domain/entities/invoice.entity.ts` — drop `dianStatus`, `dianCufe`, `dianXmlUrl`, `dianPdfUrl`.
- `src/app/features/invoicing/data/models/invoice.model.ts` — idem.
- `src/app/features/invoicing/data/datasources/invoicing-remote.datasource.ts` — idem.
- `src/app/features/invoicing/domain/usecases/request-invoice.usecase.ts` — quitar lógica DIAN/Siigo, dejar solo asignación de número interno.
- `src/app/features/invoicing/domain/usecases/reissue-invoice.usecase.ts` — **eliminar archivo** (no aplica sin FE).
- `src/app/features/invoicing/presentation/pages/invoices-list.page.{ts,html}` — quitar columna DIAN status.
- `src/app/features/customers/presentation/components/customer-edit-dialog.component.html` — quitar campo `siigo_customer_id`.
- `src/app/features/parking/presentation/components/vehicle-exit-dialog.component.ts` — quitar lógica de "emitir factura electrónica" del flow (mantener botón opcional de generar ticket interno si aplica).
- `src/app/features/parking/presentation/pages/operator-dashboard.page.ts` — quitar import `RequestInvoiceUseCase` si se decide remover el botón, o conservar para ticket interno.
- `src/app/features/reports/presentation/components/dian-status-grid.component.ts` — **eliminar archivo**.
- `src/app/features/reports/presentation/pages/reports.page.ts` — quitar referencias a `dian-status-grid`.
- `src/app/features/dashboard/presentation/pages/executive-dashboard.page.ts` — quitar widgets DIAN si los tiene.
- `src/app/features/settings/presentation/pages/settings.page.html` — eliminar tab "Facturación DIAN" (líneas 9, 86–119).
- `src/app/features/settings/presentation/forms/settings.forms.ts` — eliminar `invoicingForm`.

**Specs a eliminar**:
- `specs/features/invoicing/reissue-invoice.spec.md`
- `specs/features/invoicing/siigo-status-realtime.spec.md`

**Specs a actualizar**:
- `specs/features/invoicing/request-invoice.spec.md` — re-escribir como "ticket interno", sin DIAN ni Siigo.
- `specs/features/invoicing/view-invoice.spec.md` — quitar referencias DIAN.

### dian-fe-service
**Eliminar carpeta completa** (subproyecto Python):
- `dian-fe-service/` entero (incluye `app/`, `specs/`, `tests/`, `Dockerfile`, `fly.toml`, `pyproject.toml`, `CLAUDE.md`, `FROZEN.md`).

### Raíz
**Archivos a editar**:
- `PLAN.md`:
  - Líneas 5–6: reescribir alcance sin Siigo/DIAN.
  - Línea 21: quitar fila `dian-fe-service/` de la tabla de subproyectos.
  - Fase 9 (línea 360+): reformular sin "stub DIAN" — solo numeración interna.
  - Fase 11 (línea 440+): eliminar completa (ya estaba marcada DESCARTADA).
  - Referencias `request-invoice`/`dian-fe-service`/`CUFE`/`siigo`: limpiar todas.
- `CLAUDE.md` (raíz):
  - Línea 21: quitar `dian-fe-service/` de la tabla.
  - Línea 38: quitar specs de dian-fe-service.
  - Línea 63 (regla 6 DIAN): eliminar.
  - Renumerar reglas (5 → 4 reglas restantes ajustadas).

**Archivos a eliminar**:
- `PLAN-DIAN.md` (raíz, si existe).
- `sessions/2026-05-01-dian-fe-service-plan.md`
- `sessions/2026-05-01-siigo-fase-11-plan.md`
- `sessions/2026-05-02-siigo-fase-11-s2.md`
- `sessions/2026-05-02-siigo-fase-11-s3.md`
- `sessions/2026-05-02-siigo-fase-11-s4.md`
- `sessions/2026-05-02-siigo-fase-11-s5.md`

## Procedimiento (orden de ejecución)

1. **OK del usuario** ← **bloqueante**.
2. **DDL clean en remoto** vía `supabase db push --linked` con una migration temporal `99999_drop_siigo_and_fe_runtime.sql` que contenga los DROPs del inventario. Aplicar con confirmación.
3. **Validar remoto** vía MCP read-only: tablas siigo_* ausentes, columnas siigo_*/dian_* ausentes en `invoices` y `customers`.
4. **Reset `schema_migrations` remoto**:
   ```sql
   TRUNCATE supabase_migrations.schema_migrations;
   -- INSERT consecutivo 00001…00021 con statements vacíos (no se re-aplican).
   ```
   ⚠️ Esto desconecta el historial de versiones aplicadas. Riesgo: si en el futuro alguien hace `supabase db reset --linked`, el remoto queda inconsistente. Mitigación: el remoto no se va a resetear; las migrations renumeradas son la fuente de verdad para futuros `db push`.
5. **Eliminar archivos** locales (incluyendo la migration temporal del paso 2).
6. **Renumerar migrations** (git mv + ajustes en archivos editados).
7. **Limpieza web** (editar entities/models/components/specs).
8. **Eliminar `dian-fe-service/`** (`git rm -r dian-fe-service/`).
9. **Editar PLAN.md, CLAUDE.md raíz**, eliminar `PLAN-DIAN.md`.
10. **Eliminar bitácoras** siigo/dian.
11. **Validación local**:
    - `npx supabase start` + verificar que las 21 migraciones aplican limpias en local.
    - `ng build` en parqueadero-web sin errores.
    - `npx tsc --noEmit` en parqueadero-web sin errores (regla de memoria: no correr tests).
12. **Bitácora** `sessions/2026-05-20-eliminar-siigo-fe.md`.
13. **Commit** en `dev` con mensaje `chore: eliminar Siigo y facturación electrónica DIAN del alcance`.

## Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Editar 00002/00003/00004 rompe idempotencia en local-dev | Documentar en CLAUDE.md backend que el árbol de migrations es nuevo y dev debe `supabase db reset` local. |
| Truncar `schema_migrations` deja gap si push futuro intenta repetir 00013 | El renumerado garantiza que 00013 nuevo (monthly_tariff_unit) no existe en remoto; INSERT manual de las 21 versions lo registra. |
| Build web falla por imports a `RequestInvoiceUseCase` removido | `tsc --noEmit` antes de commit; ajustar imports rotos en cascada. |
| `vehicle-exit-dialog` queda con botón "Emitir factura" sin handler | Definir comportamiento: a) quitar botón, b) cambiar texto a "Imprimir ticket". El spec elige (a) por simplicidad. |
| `payments.invoice_id` queda como FK huérfana | Se mantiene NULLABLE; los nuevos payments pueden quedar con invoice_id NULL. Sin cambio en schema. |

## Out of scope (no se toca)

- `payments` (core POS, se mantiene íntegro).
- `parking_sessions.requested_invoice` (bandera UI, se mantiene).
- `audit_log` (historia inmutable; los registros viejos relacionados a Siigo permanecen como histórico).
- Otras features web (parking, monthly-plans, cashier, customers, vehicles, tariffs, users, reports, dashboard, settings excepto tab DIAN).

## Aprobación

- [ ] Usuario aprueba este plan.
- [ ] Confirmación explícita para los pasos 2, 4, 8 (todos destructivos).
