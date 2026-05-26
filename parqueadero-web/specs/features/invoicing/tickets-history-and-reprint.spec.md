# Spec: Historial de tickets + Reimprimir

**Identificador:** `invoicing/tickets-history-and-reprint`
**Estado:** propuesto (pendiente OK del usuario)
**Fecha:** 2026-05-20
**Subproyecto:** parqueadero-web

## Objetivo

Permitir al cajero/admin **consultar el historial completo de tickets POS internos** (`invoices`), abrir el detalle de cualquiera, y **reimprimirlo** (cliente perdió el comprobante, error de impresora, auditoría).

Out of scope: facturación electrónica DIAN/Siigo (descartada del alcance el 2026-05-20). Esto es solo ticket POS interno.

## Casos de uso

1. Cajero busca un ticket por **número interno** (ej. `FAC-2026-05-20-000123`).
2. Cajero busca por **placa** del vehículo (lookup vía `parking_sessions.vehicle_plate`).
3. Admin filtra por **rango de fechas** + **método de pago** + **cliente**.
4. Click en fila → vista detalle con todos los campos + botón **Reimprimir**.
5. Click "Reimprimir" → abre popup con el HTML del ticket de salida y dispara `window.print()`.

## UI: Lista (`/invoicing`)

| Cambio | Descripción |
|---|---|
| **Filtros** (arriba) | Form: rango fechas, placa, número, método de pago. Botón "Limpiar" / "Buscar". |
| **Columnas tabla** | Número interno · Fecha · Placa · Cliente · Método · Total · Acciones |
| **Acción fila** | Click → navega a `/invoicing/:id` (detalle). |
| **Acción rápida** | Botón "Reimprimir" inline en cada fila (admin/contador/operador). |

Paginación: la actual (20 filas/pág) se mantiene.

## UI: Detalle (`/invoicing/:id`)

Componente nuevo `invoice-detail.page`:

```
┌──────────────────────────────────────────────────┐
│ Ticket FAC-2026-05-20-000123          [Reimprimir]│
├──────────────────────────────────────────────────┤
│ Emitido: 20/05/2026 14:32                        │
│ Cliente: María Pérez (CC 12345)                  │
│ Sesión: PWR123 · carro                           │
│   Entrada: 20/05 13:10  Salida: 20/05 14:30      │
│   Duración: 1h 20min                             │
│ Tarifa aplicada: $3.400/h (plena $12.000)        │
│ Cobro: $4.000 → efectivo                         │
│ Cajero: Juan Operador · Turno #45                │
├──────────────────────────────────────────────────┤
│ Subtotal:                            $3.361      │
│ IVA 19%:                               $639      │
│ TOTAL:                               $4.000      │
└──────────────────────────────────────────────────┘
```

Datos cargados en paralelo:
- `InvoiceEntity` (por id)
- `PaymentEntity` asociada (`invoice_id`)
- `ParkingSessionEntity` (`session_id`)
- `CustomerEntity` (`customer_id`)
- `TariffEntity` (snapshot — vía `session.tariff_id`)

## Domain

### Repository: extender `InvoicingRepository`

```typescript
abstract getDetailById(invoiceId: string): Promise<Either<Failure, InvoiceDetailEntity | null>>;
```

donde `InvoiceDetailEntity` agrupa `invoice + payment + session + customer + tariff`.

### Use cases

- `GetInvoiceDetailUseCase` — orquesta los 5 fetches via `getDetailById`.
- `ReprintTicketUseCase` — recibe `invoiceId`, llama a `getDetailById`, pasa al `TicketRendererService.printSalesTicket(detail)`.

### TicketRenderer: nuevo método

```typescript
abstract printSalesTicket(detail: InvoiceDetailEntity): Promise<TicketRenderResult>;
```

Implementación en `TicketRendererService`:
- Reusa la lógica de `renderAndPrint` (popup + window.print).
- Template HTML específico de "ticket de salida": muestra placa, entrada/salida, duración, tarifa aplicada, subtotal/IVA/total, método de pago, cajero.
- IVA: usa `getTaxConfig()` + `extractInvoiceAmounts(payment.amountCents, taxConfig)` para mantener consistencia.

## Filtros backend (`list` repo)

Extender `ListInvoicesParams`:
```typescript
internalNumber?: string;   // ILIKE prefix
vehiclePlate?: string;     // join con parking_sessions
paymentMethod?: string;    // join con payments
```

Implementación en `InvoicingRemoteDataSource.list`:
- Si `vehiclePlate` o `paymentMethod`: usar select con joins explícitos:
  ```typescript
  .from('invoices')
  .select('*, parking_sessions!session_id(vehicle_plate), payments!payment_id(method)')
  ```

## Routes

```typescript
{ path: '', loadComponent: () => InvoicesListPageComponent },
{ path: ':id', loadComponent: () => InvoiceDetailPageComponent }
```

## Permisos

- **operador**: lee solo los tickets de su turno (RLS ya lo restringe via `payments.cashier_shift_id`).
- **admin/contador**: lee todos.
- Reimprimir: cualquier rol con read (la impresión es client-side, sin escritura).

## Cambios derivados

- `ticket-renderer.port.ts` → agregar abstract `printSalesTicket`.
- `ticket-renderer.service.ts` → implementar `printSalesTicket` + template HTML.
- `invoice.entity.ts` → no cambia (los joins van en `InvoiceDetailEntity` nuevo).
- `invoicing.repository.ts` → agregar `getDetailById`.
- `invoicing-remote.datasource.ts` → implementar `getDetailById` con join.
- `injection-tokens.ts` → nuevos tokens `GET_INVOICE_DETAIL_TOKEN`, `REPRINT_TICKET_TOKEN`.
- `app.config.ts` → providers de los dos use cases.
- `invoicing.routes.ts` → ruta `:id`.
- `invoices-list.page.{ts,html,scss}` → filtros + columnas extra + acción reimprimir.
- `invoice-detail.page.{ts,html,scss}` → componente nuevo.

## Definition of Done

- [ ] Cajero puede filtrar lista por placa y reimprimir un ticket sin perder estado.
- [ ] Vista detalle muestra todos los campos del mockup.
- [ ] Reimprimir genera popup con HTML completo + dispara print automático.
- [ ] RLS respetada: operador no ve tickets de otro turno.
- [ ] `npx tsc --noEmit` pasa.
- [ ] Bitácora `sessions/2026-05-20-tickets-history.md` cerrada.

## Out of scope

- Exportar a CSV (lo cubre `reports`).
- Editar/anular un ticket (decisión: ticket inmutable; correcciones via nota crédito futura).
- Re-cobrar (la sesión está cerrada; si hubo error de monto, se anula el payment y se crea uno nuevo manualmente).
