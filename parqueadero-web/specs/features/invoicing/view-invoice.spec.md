# Spec: Ver Factura

## Identificador
`invoicing/view-invoice`

> **Actualizado en Fase 11 / S1**: agrega visualización de estado Siigo (en vivo via Realtime), badge por `siigoStatus`, descarga del PDF retornado por Siigo (no Storage propio), y muestra `siigoNumber` como número fiscal junto al `internalNumber`.

## Descripción
UseCase(s) que retornan el detalle de una factura y la lista paginada de facturas, ahora reflejando el estado Siigo. Acompañado del UseCase `ObserveInvoiceStatusUseCase` para refrescar en vivo (ver `siigo-status-realtime.spec.md`).

## Actor
Admin, Contador, Operador (solo sus propias facturas — RLS).

## Pre-condiciones
- Usuario autenticado.

## Input (Params) — GetInvoice

| Campo | Tipo | Obligatorio |
|---|---|---|
| invoiceId | string (UUID) | Sí |

## Input (Params) — ListInvoices

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| dateFrom | Date \| null | No | — |
| dateTo | Date \| null | No | ≥ dateFrom |
| siigoStatus | SiigoStatus \| null | No | uno de los 7 valores enum |
| dianStatus (compat) | string \| null | No | sigue funcionando para queries legacy |
| customerId | string \| null | No | — |
| page | number | No | default 1 |
| pageSize | number | No | 10–100, default 20 |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Get éxito | `Right<InvoiceEntity>` | Factura con campos siigo + URLs |
| List éxito | `Right<{data: InvoiceEntity[], pagination: Pagination}>` | Lista paginada |
| No encontrada | `Left<NotFoundFailure>` | — |
| Sin acceso | `Left<UnauthorizedFailure>` | RLS bloquea |
| Error servidor | `Left<ServerFailure>` | — |

## Campos visibles del `InvoiceEntity` (extendidos)

```typescript
class InvoiceEntity extends BaseEntity {
  internalNumber: string;        // antes 'number'
  siigoId: string | null;
  siigoNumber: string | null;
  siigoStatus: SiigoStatus;
  siigoObservations: string[];
  siigoPdfUrl: string | null;
  siigoXmlUrl: string | null;
  siigoQrUrl: string | null;
  siigoCufe: string | null;
  siigoCude: string | null;
  siigoAttempts: number;
  siigoLastError: string | null;
  requestedInvoice: boolean;
  customerId: string;
  sessionId: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  issuedAt: Date;

  // Getters derivados
  get isFinal(): boolean { return ['Stamped','Rejected','error_max_retries'].includes(this.siigoStatus); }
  get isStamped(): boolean { return this.siigoStatus === 'Stamped'; }
  get canDownloadPdf(): boolean { return this.isStamped && this.siigoPdfUrl !== null; }
  get canReissue(): boolean { return ['Rejected','error_max_retries'].includes(this.siigoStatus); }

  // Compatibilidad legacy: derivar dianStatus si algún consumidor antiguo lo lee
  get dianStatus(): 'accepted'|'rejected'|'pending'|'sent'|'contingency' {
    return mapSiigoToDian(this.siigoStatus);  // mismo mapeo del trigger SQL
  }
}
```

## Reglas de Negocio

1. Operador solo ve facturas generadas en sus propios turnos (RLS en BD).
2. Admin/Contador ven todas.
3. **PDF/XML**: las URLs vienen directamente de Siigo (`siigoPdfUrl`, `siigoXmlUrl`). NO se sirven desde Storage propio. Las URLs son válidas mientras Siigo las mantenga (típicamente indefinido para FE estampada). Al hacer click, abrir en pestaña nueva (`target="_blank"` + `rel="noopener"`).
4. **`canDownloadPdf` solo si `Stamped && pdfUrl !== null`**: en cualquier otro estado el botón descarga aparece deshabilitado.
5. Ordenación por defecto: `issued_at DESC`.
6. `_deleted = false` implícito.
7. **`siigoLastError` visibilidad**: mostrar a `admin` y `contador` tal cual; a `operador` mostrar mensaje genérico ("Hubo un problema técnico — consulta admin"). Esta filtración es a nivel UI.
8. **Realtime**: la lista y el detalle deben suscribirse al canal de cambios (ver `siigo-status-realtime.spec.md`) para refrescar `siigoStatus` sin requerir reload.

## UI — `invoices-list.page`

### Columnas de la tabla

| Columna | Origen | Notas |
|---|---|---|
| Interno | `internalNumber` | Siempre visible (es nuestro consecutivo, sirve offline). |
| Siigo | `siigoNumber` | Vacío con guión "—" hasta `Stamped`. |
| Cliente | join customers.name | |
| Total | `totalCents` (formato COP) | |
| Estado | `<app-status-badge [status]="siigoStatus">` | Variantes en spec `siigo-status-realtime.spec.md` |
| Emitida | `issuedAt` | Formato fecha local Bogotá |
| Acciones | menú | |

### Acciones por fila

- **Ver detalle** (siempre).
- **Descargar PDF** (habilitado si `canDownloadPdf`).
- **Reintentar** (habilitado si `canReissue` — admin/contador).
- **Ver observaciones** (si `siigoObservations.length > 0`): modal con la lista.

### Filtros

- Rango fechas (default: últimos 30 días).
- Estado Siigo (multi-select).
- Cliente (autocomplete sobre `customers`).

## UI — Detalle de factura

Abre como modal o página dedicada. Muestra:

- Header: `internalNumber` y `siigoNumber` lado a lado, con badge de estado.
- Datos cliente.
- Líneas (vía `invoice_lines` — relación existente).
- Totales (subtotal, IVA, total).
- Sección "DIAN / Siigo":
  - CUFE (`siigoCufe`).
  - CUDE (`siigoCude`) si existe.
  - Observaciones (lista).
  - Última actualización (`siigoLastAttemptAt`).
  - Intentos (`siigoAttempts`) y último error (visible solo admin).
  - Botones: Descargar PDF, Descargar XML, Ver QR (si existe `siigoQrUrl`).

## Dependencias

- `InvoicingRepository.getById(invoiceId)`
- `InvoicingRepository.list(params)`
- `InvoicingRepository.observeInvoiceStatus(invoiceId)` (ver `siigo-status-realtime.spec.md`)
- `InvoicingRepository.observeInvoicesListChanges()` (ídem)

## Mapping a UI

- **GetInvoice**: modal/página de detalle desde `InvoicesListPage`.
- **ListInvoices**: `InvoicesListPage` con filtros + Realtime.
- **Acciones**: Descargar PDF (URL Siigo), Descargar XML (URL Siigo), Reintentar (admin/contador).

## Cambios respecto a la versión Fase 9

| Antes | Ahora |
|---|---|
| Filtro `dianStatus` | Filtro `siigoStatus` (preserva `dianStatus` como compat) |
| Columna "Número" | Columnas "Interno" + "Siigo" |
| URLs desde Storage propio (cuando hubiera) | URLs desde Siigo directamente |
| Refresh manual con polling | Realtime via Supabase channel |
| Estado único `dian_status` | `siigoStatus` autoritativo, `dianStatus` derivado |
