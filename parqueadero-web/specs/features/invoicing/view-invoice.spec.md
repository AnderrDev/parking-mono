# Spec: Ver Factura

## Identificador
`invoicing/view-invoice`

## Descripción
UseCase que retorna el detalle completo de una factura, incluyendo URLs firmadas para descargar XML y PDF desde Storage. También lista facturas con filtros.

## Actor
Admin, Contador, Operador (solo sus propias facturas).

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
| dianStatus | string \| null | No | `'accepted'` \| `'pending'` \| `'rejected'` \| `'contingency'` |
| customerId | string \| null | No | — |
| page | number | No | default 1 |
| pageSize | number | No | 10–100, default 20 |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Get éxito | `Right<InvoiceEntity>` | Factura con URLs de descarga |
| List éxito | `Right<{data: InvoiceEntity[], pagination: Pagination}>` | Lista paginada |
| No encontrada | `Left<NotFoundFailure>` | — |
| Sin acceso | `Left<UnauthorizedFailure>` | Operador intenta ver factura ajena |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. Operador solo ve facturas generadas en sus propios turnos (RLS en BD).
2. Admin/Contador ven todas.
3. URLs de XML/PDF: si existen en Storage, generar URL firmada (15 min) al momento de la consulta. Si `dian_status != 'accepted'` o el archivo aún no existe, las URLs son `null`.
4. Ordenación por defecto: `issued_at DESC`.
5. `_deleted = false` implícito.

## Dependencias
- `InvoicingRepository.getById(invoiceId)`
- `InvoicingRepository.list(params)`

## Mapping a UI
- **GetInvoice**: Modal de detalle desde `InvoicesListPage`.
- **ListInvoices**: `InvoicesListPage` → tabla con columnas: Número | Cliente | Monto | Estado DIAN | Fecha | Acciones.
- **Acciones**: Descargar XML, Descargar PDF (si existen), Reintentar (si contingencia/rechazada).
