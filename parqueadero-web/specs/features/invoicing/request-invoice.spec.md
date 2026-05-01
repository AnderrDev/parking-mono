# Spec: Solicitar Factura Electrónica

## Identificador
`invoicing/request-invoice`

## Descripción
UseCase que solicita la emisión de una factura electrónica para una sesión de parking ya cerrada. Invoca la Edge Function `request-invoice` que asigna número, llama a `dian-fe-service` (o stub), y persiste el resultado en `invoices`.

## Actor
Operador, Admin (en el momento del cobro o a posteriori).

## Pre-condiciones
- Usuario autenticado.
- La sesión de parking tiene `status = 'completed'` y un pago asociado.
- El cliente (`customerId`) existe y tiene datos fiscales válidos (docType, docNumber, email).
- No existe factura vigente para la misma sesión (`invoice_id IS NULL` en `payments` o `dian_status != 'accepted'`).

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| sessionId | string (UUID) | Sí | Sesión completada |
| customerId | string (UUID) | Sí | Cliente con datos fiscales |
| notes | string \| null | No | Observaciones internas (max 500 chars) |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<InvoiceEntity>` | Factura emitida (`dian_status = 'accepted'`) o en contingencia |
| Sesión no válida | `Left<NotFoundFailure>` | Sesión no existe o no completada |
| Cliente incompleto | `Left<ValidationFailure>` | Faltan datos fiscales del cliente |
| Factura ya existe | `Left<BusinessRuleFailure>` | Ya hay factura aceptada para esta sesión |
| Error DIAN | `Left<ServerFailure>` | Edge Function o DIAN falló |

## Reglas de Negocio

1. El número de factura es asignado por la Edge Function mediante una secuencia en BD (`invoices_seq`). El cliente **nunca** asigna números.
2. El IVA aplica según la tarifa: parqueadero en Colombia generalmente aplica 19% IVA sobre el cobro. Si `amountCents = 0` (cortesía/mensual), la factura es por $0.
3. Si `dian_status = 'contingency'` (DIAN caída), la factura se guarda con ese estado y puede reintentarse (ver `reissue-invoice`). Se considera éxito parcial: retorna `Right(invoice)`.
4. Si ya existe factura con `dian_status = 'accepted'` para esa sesión: `BusinessRuleFailure`.
5. La Edge Function usa `DIAN_FE_SERVICE_URL` del entorno. Si vacía → usa stub local (misma forma de respuesta).

## Flujo Principal

1. UseCase valida `sessionId` y `customerId`.
2. Llama a `InvoicingRepository.requestInvoice(params)`.
3. Repository invoca Edge Function `request-invoice` via Supabase functions.
4. Edge Function: asigna número → llama dian-fe-service/stub → inserta en `invoices` → retorna invoice.
5. UseCase retorna `Right(invoiceEntity)`.

## Contrato JSON del stub / dian-fe-service (alineado con `dian-fe-service/specs/emit-invoice.spec.md`)

```json
{
  "success": true,
  "invoice_number": "FAC-2026-04-29-0001",
  "cufe": "STUB-550e8400-e29b-41d4-a716-446655440000",
  "dian_status": "accepted",
  "xml_url": null,
  "pdf_url": null,
  "issued_at": "2026-04-29T14:35:30Z"
}
```

## Edge Cases

- Sesión con `amountCents = 0` (cortesía): factura válida por $0.
- DIAN retorna `rejected`: `dian_status = 'rejected'` en BD, `ServerFailure` al UseCase con mensajes de DIAN.
- Reintento de factura en contingencia: primero verificar si ya hay `accepted` para la misma sesión.

## Dependencias
- `InvoicingRepository.requestInvoice(params)` → invoca Edge Function
- Edge Function `request-invoice` → dian-fe-service o stub

## Mapping a UI
- **Invocación**: `VehicleExitDialog` → botón "Emitir factura" (opcional al cerrar)
- **Feedback**: Toast "Factura emitida: FAC-2026-04-29-0001" o error descriptivo.
