# Sesión: Siigo (Fase 11) — Plan + Sub-fase S1 (Specs)

**Fecha:** 2026-05-01
**Subproyecto(s):** parqueadero-backend, parqueadero-web, root
**Estado:** completada

## Objetivos
- [x] Plan aprobado en `~/.claude/plans/vamos-a-hacer-una-purring-meadow.md`
- [x] Registrar Fase 11 en `PLAN.md` raíz con sub-fases S1–S9
- [x] Crear specs nuevas en `parqueadero-backend/specs/edge-functions/`:
  - [x] `siigo-emit-invoice.spec.md`
  - [x] `siigo-poll-status.spec.md`
  - [x] `_shared-siigo-client.spec.md`
- [x] Crear `parqueadero-backend/specs/database-schema-siigo-delta.spec.md`
- [x] Crear `parqueadero-backend/specs/rls-policies-siigo.spec.md`
- [x] Crear specs web:
  - [x] `parqueadero-web/specs/features/parking/cashier-fiscal-data-capture.spec.md`
  - [x] `parqueadero-web/specs/features/invoicing/siigo-status-realtime.spec.md`
- [x] Actualizar specs web existentes:
  - [x] `request-invoice.spec.md`
  - [x] `view-invoice.spec.md`
  - [x] `reissue-invoice.spec.md`
- [x] `tsc --noEmit` en web limpio (sin cambios de código en S1)

## Contexto (resumen del plan aprobado)

Integración de **Siigo** como único proveedor de facturación electrónica, vía Edge Functions de Supabase (Deno). Reemplaza el flujo anterior que iba directo a DIAN con `dian-fe-service` (que queda congelado). Decisiones cerradas:

1. Edge Function nueva en Supabase Deno; sin nuevo subproyecto.
2. Siigo es único proveedor productivo.
3. Numeración dual: `internal_number` (sigue `nextval_invoices()`) + `siigo_number` asignado por Siigo.
4. FE solo cuando el cliente la pide (toggle existente en `vehicle-exit-dialog`).
5. Asíncrona: cron polling cada 30 s actualiza estado.
6. Auto-create cliente en Siigo on-demand.
7. NO emitir FE en salidas que se cierran contra mensualidad — toggle bloqueado.

## Avance

### Plan + decisiones (con AskUserQuestion)
- Plan aprobado en `~/.claude/plans/vamos-a-hacer-una-purring-meadow.md` con todas las decisiones cerradas (ubicación = Edge Function nueva en Supabase Deno; estrategia = Siigo único proveedor, dian-fe-service congelado; numeración dual; FE solo cuando el cliente la pide; asíncrona con polling; auto-create cliente; salidas mensuales NO emiten FE).

### `PLAN.md` raíz
- Agregada Fase 11 completa con sub-fases S1–S9 y DoD por cada una.
- Sección "Cuándo entra `dian-fe-service`" reescrita: marcado como **CONGELADO** (D1–D8 conservados como referencia; D9/D10 nunca se completan).
- Header del PLAN actualizado: alcance ahora incluye Siigo en Fase 11; "fuera de alcance" eliminado.
- "Estado actual": Fase 11 agregada como ⏳ en curso (S1).
- Resumen de fases: nueva fila Fase 11; nota de paralelismo con Fase 8.

### Specs backend (5 nuevas)
- `parqueadero-backend/specs/edge-functions/siigo-emit-invoice.spec.md` — EF de emisión asíncrona, idempotencia por `session_id`, bloqueo plan mensual, mapping a payload Siigo.
- `parqueadero-backend/specs/edge-functions/siigo-poll-status.spec.md` — Cron cada 30 s, `get_invoices_for_polling(20)`, backoff `min(attempts²×5, 300)s`, MAX_RETRIES=30, mapeo `stamp.status → siigo_status`.
- `parqueadero-backend/specs/edge-functions/_shared-siigo-client.spec.md` — Módulo común (`auth`, `client`, `customer`, `mapper`, `poll-mapper`, `types`, `errors`); cache de token 23 h en `siigo_auth_tokens`; sanitización para auditoría.
- `parqueadero-backend/specs/database-schema-siigo-delta.spec.md` — Migration 00013: renombre `number→internal_number`, columnas siigo_*, trigger `sync_dian_from_siigo` (deriva legacy `dian_status`), tablas `siigo_invoice_attempts` (append-only) y `siigo_auth_tokens` (single-row), función `get_invoices_for_polling` con `FOR UPDATE SKIP LOCKED`. Migration 00014: cron pg_cron + pg_net.
- `parqueadero-backend/specs/rls-policies-siigo.spec.md` — `siigo_invoice_attempts` y `siigo_auth_tokens`: solo `service_role`. Restricción adicional propuesta: operador no puede mutar `siigo_*` directamente. Tests RLS sugeridos `04_*`, `05_*`, `06_*`.

### Specs web (2 nuevas + 3 actualizadas)
- **Nuevas**:
  - `parqueadero-web/specs/features/parking/cashier-fiscal-data-capture.spec.md` — Extiende `vehicle-exit-dialog`: bloqueo del toggle FE para mensualidad; sub-formulario fiscal inline cuando faltan `doc_type/doc_number/name/email`; nuevo campo `customerFiscalUpdates` en `ExitFormValue`.
  - `parqueadero-web/specs/features/invoicing/siigo-status-realtime.spec.md` — UseCases `ObserveInvoiceStatus*` con `supabase.channel().on('postgres_changes')`; mapping `siigoStatus → variante badge`; reconexión + re-fetch al volver red; reglas para botones (PDF/Reintentar/Observaciones).
- **Actualizadas**:
  - `request-invoice.spec.md` — Datasource invoca `siigo-emit-invoice` (no `request-invoice`); contrato JSON nuevo; campos `internalNumber/siigoStatus/...`; estados intermedios; comportamiento offline `queued_offline`.
  - `view-invoice.spec.md` — Filtro por `siigoStatus`; columnas Interno + Siigo; PDF desde Siigo (no Storage); `siigoLastError` solo a admin/contador; integración Realtime.
  - `reissue-invoice.spec.md` — Solo aplica a `Rejected`/`error_max_retries`; crea **nueva** invoice (no UPDATE); `Stamped` requiere nota crédito (out of scope).

### Verificación
- `npx tsc --noEmit` en `parqueadero-web` → sin errores (no hubo cambios de código TS en S1).

## Decisiones

- **Renombre `invoices.number → internal_number`** en lugar de agregar otra columna: el nombre antiguo era ambiguo entre "consecutivo operacional" y "consecutivo fiscal". El renombre es disruptivo pero el trigger `sync_dian_from_siigo` y la conservación de `dian_status` cubren la compat hacia atrás. La EF `request-invoice` legacy se ajusta en S2 (insertar `internal_number`) y se elimina en S9.
- **Trigger `sync_dian_from_siigo` derivado**: en lugar de eliminar `dian_status`, se deriva automáticamente desde `siigo_status`. Mantiene queries históricas y reportes operativos sin cambios.
- **`siigo_auth_tokens` con `CHECK (id=1)`** y `UPSERT` en lugar de Vault: simplicidad. Token rota cada 24 h y siempre se renueva on-demand vía `getSiigoToken`.
- **Cron 30 s + batch 20**: deja 40 req/min ≤ budget Siigo (~50 req/min). Subir a 60 s si Siigo devuelve 429 sostenido (sin tocar código, vía `cron.alter_job`).
- **Reintento de `Stamped` = NO permitido**: requiere nota crédito Siigo. Botón "Reintentar" en UI solo se muestra para `Rejected`/`error_max_retries`.
- **Realtime + RLS**: Supabase respeta RLS en el stream de cambios → operador solo recibe eventos de sus propias facturas, sin policy adicional.

## Bloqueos / Pendientes

- **Sandbox Siigo**: solicitar credenciales a `soporteapi@siigo.com` (NIT del comercio + Partner-Id).
- **Costo por documento Siigo**: confirmar con comercial Siigo antes de S4.
- **Catálogo Siigo Nube**: pre-cargar manualmente productos ("Parqueo por hora", "Plan mensual"), formas de pago, vendedor, resolución DIAN; anotar IDs para los env vars `SIIGO_PRODUCT_ID_*`, `SIIGO_PAYMENT_*`, `SIIGO_DOCUMENT_TYPE_ID`, `SIIGO_SELLER_ID`.
- **Decisión menor en RLS**: si la cláusula `WITH CHECK` que evita que operador mute `siigo_*` resulta complicada en práctica, alternativa = revocar UPDATE directo a operador en `invoices` (todo cambio pasa por EF). Resolver al implementar S2.

## Next Steps

- [ ] **S2** Schema delta + audit table — migration `00013_siigo_integration.sql`.
- [ ] **S3** Helper de auth + cache de token (`_shared/siigo/auth.ts`).
- [ ] **S4** Edge Function `siigo-emit-invoice`.
- [ ] **S5** Edge Function cron `siigo-poll-status` + migration `00014_siigo_polling_cron.sql`.
- [ ] **S6** UI cashier (extender `vehicle-exit-dialog` con form fiscal + bloqueo plan mensual).
- [ ] **S7** UI invoices-list con Realtime.
- [ ] **S8** Catálogo Siigo Nube + sandbox QA.
- [ ] **S9** Production cutover y deprecation de `request-invoice` actual.
