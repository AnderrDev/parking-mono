# Sesión 2026-05-20 — Eliminar Siigo + Facturación electrónica del alcance

**Estado:** ✅ COMPLETADA (todas las migrations aplicadas al remoto vía MCP)
**Operador:** Claude Code + Ander
**Spec base:** `parqueadero-backend/specs/remove-siigo-and-fe.spec.md`
**Decisión:** el alcance del proyecto NO incluye facturación electrónica de terceros (Siigo) ni DIAN directa. El parqueadero opera como POS con ticket interno numerado.

## Cierre 2026-05-21 — migrations P0/P1 aplicadas en remoto

Tras reconfigurar el MCP supabase en modo write (sin `--read-only`), apliqué secuencialmente vía `mcp__supabase__apply_migration`:

1. ✅ **00022 rls_auth_caching** — 36 RLS policies reescritas con `(SELECT auth.jwt())` para promoción a InitPlan.
2. ✅ **00023 fk_indexes** — 4 índices parciales sobre FKs sin cobertura (tariff_id, monthly_plan_id, payment_id, app_settings.updated_by).
3. ✅ **00024 rpc_exit_with_payment** — function `register_vehicle_exit_with_payment(...)` atómica, SECURITY INVOKER, idempotente.
4. ✅ **00025 rpc_monthly_plan_with_payment** — function `create_monthly_plan_with_payment(...)` atómica con validación de solapamiento.
5. ✅ **00026 operational_config_thresholds** — agregados `diff_threshold_cents=500000` y `max_report_range_days=365` a `app_settings.operational_config`.
6. ✅ **cleanup_fe_drops** — drop trigger `trg_invoices_sync_dian` + 2 tablas siigo + 12 cols siigo + 4 cols dian + col cufe + 3 cols siigo en customers + 5 funciones helper.
7. ✅ **00018 stale_write_protection** — function `check_stale_write()` + 3 triggers `aaa_check_stale_write_*` (faltaba aplicar).
8. ✅ **align_schema_history** — DELETE + UPDATE + INSERT para alinear `supabase_migrations.schema_migrations` con los 26 archivos locales.

**Verificación final**: 26 migrations consecutivas (00001-00026), 0 tablas/cols siigo, 0 cols dian, 4 FK indexes nuevos, 3 funciones nuevas, 3 triggers stale_write, settings con nuevos thresholds.

**Pendiente único (no SQL)**: activar "Leaked password protection" en Supabase Studio → Auth → Settings → Password protection. Toggle manual.

## Alcance ejecutado

### Backend (parqueadero-backend/)
- ✅ Eliminadas 4 migrations Siigo del árbol: `00013_siigo_integration`, `00014_siigo_polling_cron`, `00017_siigo_cufe_unique`, `00021_drop_siigo`.
- ✅ Renumeradas las 9 restantes para tener 21 migrations consecutivas (00001–00021).
- ✅ Editadas 5 migrations supervivientes para quitar referencias siigo/dian/cufe (00002 columnas, 00010 invoicing_config, 00014 comentario, 00015 comentario, 00020 renumeración, 00021 renumeración).
- ✅ Eliminadas Edge Functions: `siigo-emit-invoice/`, `siigo-poll-status/`, `_shared/siigo/` (7 archivos).
- ✅ Reescrita la Edge Function `request-invoice/index.ts` como asignador de número interno sin DIAN/Siigo.
- ✅ Eliminados 6 specs Siigo (`database-schema-siigo-delta`, `rls-policies-siigo`, `edge-functions/siigo-*`, `edge-functions/_shared-siigo-client`, `edge-functions/request-invoice`, `migration-to-remote`).
- ✅ Eliminados 3 RLS tests Siigo (`04_siigo_audit_immutable`, `05_siigo_status_trigger`, `06_siigo_auth_tokens`).
- ✅ Limpieza de comentarios siigo/dian en `pen-test/README.md`, `_shared/logger.ts`.
- ✅ Limpieza de `.env.example` y `supabase/.env` (variables Siigo eliminadas).
- ✅ `CLAUDE.md` backend: regla DIAN eliminada, request-invoice ahora es ticket interno, retención de backup despegada de DIAN.
- ✅ Specs `database-schema.spec.md`, `rls-policies.spec.md`, `tax-config.spec.md` limpios.

### Web (parqueadero-web/)
- ✅ `invoice.entity.ts` + `invoice.model.ts` + mapper limpios (sin `cufe`, `dianStatus`, `dianCufe`, `dianXmlUrl`, `dianPdfUrl`).
- ✅ `invoicing.repository.ts` (abstract) y `.impl.ts` sin `reissueInvoice`.
- ✅ `invoicing-remote.datasource.ts` sin `reissueInvoice`, sin filtro `dianStatus`.
- ✅ `request-invoice.usecase.ts` queda como ticket interno; `reissue-invoice.usecase.ts` eliminada.
- ✅ `list-invoices.usecase.ts` sin `DianStatus`.
- ✅ `invoices-list.page.{ts,html,scss}` simplificado (columnas Número/Fecha/Total, sin DIAN/CUFE/Reintentar).
- ✅ `injection-tokens.ts` y `app.config.ts` sin `REISSUE_INVOICE_TOKEN`.
- ✅ `customer-edit-dialog.component.html` sin campo "Responsabilidades fiscales (DIAN)".
- ✅ `settings.page.{ts,html}` + `settings.forms.ts` + `app-setting.entity.ts` sin tab "Facturación DIAN" / `invoicing_config`.
- ✅ `executive-dashboard.page.{ts,html}` sin KPI "Facturas pendientes" (dependía de `dianStatus`); link "Gestionar facturas" → "Ver tickets".
- ✅ `reports.page.{ts,html,scss}` sin KPI "Total facturado (DIAN)" ni card "Facturación electrónica (DIAN)".
- ✅ `dian-status-grid.component.{ts,scss}` eliminado.
- ✅ `operator-dashboard.page.ts` (`emitInvoiceFor`) ahora notifica "ticket emitido" en lugar de "factura DIAN".
- ✅ Web `CLAUDE.md`: regla 6 (DIAN) eliminada, deployment quita "Microservicio FE Fly.io".
- ✅ Specs web: `cashier-fiscal-data-capture.spec.md`, `view-invoice.spec.md`, `reissue-invoice.spec.md`, `siigo-status-realtime.spec.md` eliminados.
- ✅ Specs web: `request-invoice.spec.md` reescrita como ticket interno; `reports-page.spec.md`, `offline-sync.spec.md`, `firebase-hosting.spec.md`, `monthly-plans/create-monthly-plan.spec.md`, `customers/*.spec.md` actualizadas.
- ✅ `npx tsc --noEmit` pasa sin errores.

### Raíz
- ✅ `dian-fe-service/` subproyecto eliminado entero (git rm -r).
- ✅ `PLAN-DIAN.md` eliminado.
- ✅ `PLAN.md` v2.1: alcance reducido, Fase 11 eliminada, Fase 9 reformulada como "ticket interno", sección histórica `dian-fe-service` eliminada, riesgo "Stub DIAN" eliminado.
- ✅ `CLAUDE.md` raíz: `dian-fe-service` fuera de la tabla, specs DIAN fuera del listado, regla 6 (Facturación DIAN) eliminada, nota "Out of scope FE/Siigo" agregada.
- ✅ 6 bitácoras Siigo/DIAN eliminadas: `2026-05-01-{dian-fe-service-plan,siigo-fase-11-plan}.md`, `2026-05-02-siigo-fase-11-s{2,3,4,5}.md`.

### Remoto Supabase (pendiente — destructivo)
- ⏳ Script `parqueadero-backend/supabase/migrations_archive/cleanup_fe_2026-05-20.sql` listo para ejecutar.
- ⏳ Contiene: DROPs (2 tablas siigo, 12+4 cols invoices, 3 cols customers, 1 col `cufe`, 5 funciones siigo/dian) + TRUNCATE supabase_migrations.schema_migrations + INSERT 21 nuevas filas.
- ⏳ **Aplicar con**: `psql "$SUPABASE_DB_URL" -f parqueadero-backend/supabase/migrations_archive/cleanup_fe_2026-05-20.sql` o desde Studio SQL editor.

## Decisiones
- **Conservar `invoices` + `invoice_lines`**: como ticket interno (decisión del usuario tras AskUserQuestion).
- **Eliminar y resetear `schema_migrations`**: dado que las migrations renumeradas localmente coinciden estructuralmente con el remoto, se prefiere truncar + reinsertar 21 filas vacías (estado físico ya alineado).
- **`responsabilidadesFiscales` (customers)**: campo legacy se mantiene en BD/entity por compatibilidad de datos previos; quitado solo del UI.
- **Bitácoras siigo borradas**: por petición explícita del usuario.

## Next Steps
1. Usuario: ejecutar `cleanup_fe_2026-05-20.sql` contra el remoto (confirmación destructiva pendiente).
2. Tras la ejecución, validar via MCP `list_tables` + `list_migrations`.
3. Commit en `dev` con mensaje `chore: eliminar Siigo y facturación electrónica DIAN del alcance`.
4. Considerar borrar archivo `cleanup_fe_2026-05-20.sql` después de aplicado (o conservar en `migrations_archive/` como evidencia histórica).

## Verificaciones realizadas
- `npx tsc --noEmit` en `parqueadero-web/` → sin errores.
- `grep -rln siigo|dian|cufe` en backend/web/raíz → solo notas explicativas ("FE descartada").
- `git status` muestra cambios coherentes en `dev`.
