# Spec: Reemitir Factura (Reintentar)

## Identificador
`invoicing/reissue-invoice`

## Descripción
UseCase que reintenta el envío a DIAN de una factura en estado `contingency` o `rejected`. Reutiliza el mismo número de factura ya asignado; no genera uno nuevo.

## Actor
Admin, Contador.

## Pre-condiciones
- Usuario autenticado con rol `admin` o `contador`.
- La factura existe y tiene `dian_status IN ('contingency', 'rejected')`.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| invoiceId | string (UUID) | Sí | Factura existente en contingencia o rechazada |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<InvoiceEntity>` | Factura reenviada (`accepted` o `contingency` de nuevo) |
| No encontrada | `Left<NotFoundFailure>` | Factura no existe |
| Estado inválido | `Left<BusinessRuleFailure>` | Factura ya `accepted` — no se puede reemitir |
| Error DIAN | `Left<ServerFailure>` | Edge Function o DIAN falló |

## Reglas de Negocio

1. Solo facturas con `dian_status IN ('contingency', 'rejected')` pueden reemitirse.
2. El número de factura (`invoice_number`) NO cambia — se usa el ya asignado.
3. El CUFE puede cambiar (si la primera emisión no llegó a DIAN). El stub siempre retorna el mismo CUFE para el mismo número.
4. Si DIAN vuelve a rechazar: actualizar `dian_status = 'rejected'`, retornar `ServerFailure` con mensajes.
5. Si vuelve a dar contingencia: `dian_status = 'contingency'`, retornar `Right(invoice)`.

## Flujo Principal

1. Buscar factura por `invoiceId`.
2. Verificar estado permite reemisión.
3. Llamar Edge Function `request-invoice` con flag `reissue: true` y `invoiceId`.
4. Edge Function: reutiliza datos existentes → llama dian-fe-service → actualiza `invoices` → retorna.
5. Retornar `Right(invoiceEntity)`.

## Dependencias
- `InvoicingRepository.reissueInvoice(invoiceId)`

## Mapping a UI
- **Invocación**: `InvoicesListPage` → menú contextual "Reintentar" en facturas con estado contingencia/rechazada.
