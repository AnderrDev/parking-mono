# Sesión: Fase 9 — Invoicing + stub DIAN

**Fecha:** 2026-04-29  
**Estado:** completada  
**Rama:** main

---

## Specs creados

- [x] `specs/features/invoicing/request-invoice.spec.md`
- [x] `specs/features/invoicing/reissue-invoice.spec.md`
- [x] `specs/features/invoicing/view-invoice.spec.md`
- [x] `parqueadero-backend/specs/edge-functions/request-invoice.spec.md`

Contrato JSON alineado con `dian-fe-service/specs/emit-invoice.spec.md`.

---

## Backend

- [x] `migrations/00007_invoicing_sequence.sql`
  - `invoices.session_id` (FK → parking_sessions)
  - `invoices.notes` TEXT
  - `CREATE SEQUENCE invoices_number_seq`
  - `CREATE FUNCTION nextval_invoices()` (SECURITY DEFINER, solo service_role)

- [x] `functions/request-invoice/index.ts`
  - Verifica JWT + rol
  - New invoice: carga sesión + pago + cliente → asigna número → llama dian-fe-service o stub → INSERT invoices → UPDATE payments.invoice_id
  - Reissue: carga factura existente → llama servicio → UPDATE invoices
  - Stub activo cuando `DIAN_FE_SERVICE_URL` vacía; mismo JSON shape que el servicio real
  - Timeout DIAN 28s → `dian_status = 'contingency'`

---

## Angular

### Domain
- [x] `invoicing/domain/entities/invoice.entity.ts` — `InvoiceEntity` con `isAccepted`, `canReissue`, `hasDocuments`
- [x] `invoicing/domain/repositories/invoicing.repository.ts` — abstract: `requestInvoice`, `reissueInvoice`, `getById`, `list`
- [x] `invoicing/domain/usecases/request-invoice.usecase.ts`
- [x] `invoicing/domain/usecases/reissue-invoice.usecase.ts`
- [x] `invoicing/domain/usecases/list-invoices.usecase.ts`

### Data
- [x] `invoicing/data/models/invoice.model.ts` — model + mapper
- [x] `invoicing/data/datasources/invoicing-remote.datasource.ts` — invoca Edge Function para request/reissue; queries directas a Supabase para list/getById
- [x] `invoicing/data/repositories/invoicing.repository.impl.ts`

### DI + Routes
- [x] 5 tokens nuevos en `injection-tokens.ts`
- [x] `invoicing/invoicing.routes.ts` — providers completos + `InvoicesListPageComponent`

### Presentation
- [x] `invoicing/presentation/pages/invoices-list.page.ts` — tabla con paginación, badges de estado DIAN, links XML/PDF, botón "Reintentar" para contingencia

### Verificación
- [x] `tsc --noEmit` — 0 errores

---

## Notas técnicas

- `InvoicingRepositoryImpl` inyecta `InvoicingRemoteDataSource` directamente (no hay local stub de invoicing — facturas solo online, crítico y sensible)
- La Edge Function maneja ambos flujos (new + reissue) por el mismo endpoint con flag `reissue: boolean`
- El número de factura es generado server-side vía `nextval('invoices_number_seq')` — nunca en cliente
- IVA fijo al 19% en esta versión (configurable en Fase 10 si se necesita)

---

## Next Steps

- Fase 8: Offline hardening (PowerSync) — requiere reescribir todos los `*-local.datasource.ts`
- Agregar botón "Emitir factura" en `VehicleExitDialog` (integración parking ↔ invoicing)
- `role.guard.ts` para bloquear operadores de `/invoicing` (actualmente solo `authGuard`)
- Storage bucket `invoices/` en Supabase Studio (para XML/PDF cuando aplique)
