# Sesión 2026-05-20 — Historial de tickets + Reimprimir

**Estado:** ✅ completada
**Operador:** Claude Code + Ander
**Spec base:** `parqueadero-web/specs/features/invoicing/tickets-history-and-reprint.spec.md`

## Objetivo
Permitir al operador / admin consultar el historial de tickets POS internos con filtros, abrir el detalle de cualquiera y reimprimirlo. Sin tocar facturación electrónica (out of scope desde 2026-05-20).

## Cambios

### Domain (`parqueadero-web/src/app/features/invoicing/domain/`)
- ✅ Nueva `entities/invoice-detail.entity.ts` — agrupa `invoice + payment + session + customer + tariff` con getters `paymentMethod`, `vehiclePlate`, `durationMinutes`.
- ✅ `repositories/invoicing.repository.ts` — agregado `getDetailById(id)` abstract; `ListInvoicesParams` extendido con `internalNumber`, `vehiclePlate`, `paymentMethod`; nuevo `ListInvoicesRow` (joinea placa/cliente/método para la tabla).
- ✅ `usecases/get-invoice-detail.usecase.ts` — valida invoiceId y delega al repo.
- ✅ `usecases/reprint-ticket.usecase.ts` — orquesta `getDetailById` + `TicketRendererPort.printSalesTicket`.

### TicketRenderer
- ✅ `parking/domain/services/ticket-renderer.port.ts` — agregado `abstract printSalesTicket(detail)`.
- ✅ `parking/data/services/ticket-renderer.service.ts` — implementado `printSalesTicket()` con template HTML del comprobante de cobro (80mm). Reusa `getParkingInfo`, `splitBogotaDateTime`, `escapeHtml`, `formatCOP`. Bloque "REIMPRESIÓN" visible al final.

### Data (`parqueadero-web/src/app/features/invoicing/data/`)
- ✅ `datasources/invoicing-remote.datasource.ts` — implementado `getDetailById` con join 4-way (`customers`, `payments`, `parking_sessions → tariffs`). `list` extendido con filtros (internalNumber con ILIKE, vehiclePlate via join, paymentMethod via join) y nuevo shape `ListInvoicesRow`.
- ✅ `repositories/invoicing.repository.impl.ts` — proxy del nuevo `getDetailById`.

### DI
- ✅ `core/di/injection-tokens.ts` — `GET_INVOICE_DETAIL_TOKEN`, `REPRINT_TICKET_TOKEN`.
- ✅ `app.config.ts` — providers de ambos use cases + imports.

### Presentation
- ✅ `invoices-list.page.{ts,html,scss}` — reescrita: form de filtros (rango fechas, placa, número, método), columnas Placa/Cliente/Método, click fila → detalle, botón "Reimprimir" inline (con stopPropagation).
- ✅ `invoice-detail.page.{ts,html,scss}` — nueva: muestra emitido/cliente/sesión/tarifa/totales según mockup del spec; botón "Reimprimir" prominente.
- ✅ `invoicing.routes.ts` — ruta `:id` agregada.

## Verificación
- ✅ `npx tsc --noEmit` sin errores.
- ✅ Spec cubre los 5 casos de uso del spec (búsqueda por número, placa, filtros admin, detalle, reimpresión).
- ✅ RLS respetada: la query usa el JWT del usuario (no service_role); operador solo ve sus tickets vía las policies existentes.

## Decisiones / notas
- **PaymentMethod label map** está duplicado en `invoices-list.page.ts` y `invoice-detail.page.ts` y `ticket-renderer.service.ts`. Trade-off aceptado por ahora (3 lugares); centralizar si crece a 5+.
- **Filtros con join**: las cláusulas `eq('parking_sessions.vehicle_plate', X)` y `eq('payments.method', X)` aplican sobre el subselect. Funciona en Supabase REST pero hay edge case: si la fila no tiene `parking_sessions`/`payments` relacionados, queda excluida del resultado cuando el filtro está presente. Esperado: solo filtramos cuando aplica.
- **Reimpresión via popup**: reusa la misma técnica que el ticket de entrada. El popup blocker del navegador puede impedirlo → toast informativo cubre el caso.

## Next Steps
- Verificar manualmente en dev cuando haya datos reales (hoy `invoices=0` en remoto). Crear un ticket de prueba y reimprimirlo.
- Mejora menor futura: centralizar `PAYMENT_METHOD_LABEL` en `shared/utils/payment-method.utils.ts`.
- Considerar QR en el ticket de salida para que el cliente pueda escanear y descargar PDF si futuro.

## Out of scope
- Exportar histórico a CSV (cubre `reports`).
- Editar/anular ticket (decisión: inmutable; correcciones via nota crédito futura).
- Re-cobrar.
