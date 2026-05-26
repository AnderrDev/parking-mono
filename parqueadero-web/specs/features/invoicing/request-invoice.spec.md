# Spec: Solicitar Ticket Interno (POS)

## Identificador
`invoicing/request-invoice`

> **Decisión 2026-05-20**: el proyecto descartó facturación electrónica
> (Siigo/DIAN). Este UseCase emite **tickets POS internos numerados**
> (`internal_number`) que sirven como comprobante de cobro, **no** son
> factura electrónica fiscal.

## Descripción
UseCase que solicita la emisión de un ticket interno para una sesión de parking ya cerrada. Invoca la Edge Function `request-invoice` que:
1. Verifica que la sesión esté cerrada (`status='completed'`).
2. Asigna `internal_number` vía `nextval_invoices()` (sequence local).
3. Calcula `subtotal/tax/total` desde el `payment` cobrado usando `tax_config` (régimen común, IVA incluido).
4. Persiste el ticket en `invoices` con `requested_invoice=true`.

Comportamiento **síncrono**: el UseCase retorna apenas el INSERT confirma.

## Inputs
| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| sessionId | UUID | Sí | Sesión ya cerrada |
| customerId | UUID | Sí | Cliente al que se le emite el ticket |
| notes | string \| null | No | Hasta 500 caracteres |

## Output
| Caso | Resultado | Notas |
|---|---|---|
| Éxito | `Right<InvoiceEntity>` | Ticket persistido |
| Validación | `Left<ValidationFailure>` | sessionId/customerId faltantes o notes > 500 |
| Sesión inválida | `Left<ServerFailure>` | EF responde 422 (sesión no completed) |
| Ticket previo | `Left<ServerFailure>` | EF responde 409 (ya existe ticket para la sesión) |
| Cliente no existe | `Left<ServerFailure>` | EF responde 404 |
| Red caída | `Left<NetworkFailure>` | timeout o fetch falló |

## Reglas
1. **Idempotencia**: si ya existe un payment con `invoice_id` para esa sesión, la EF responde 409. El UseCase no reintenta automático.
2. **Numeración**: `internal_number` formato `FAC-YYYY-MM-DD-NNNNNN` lo asigna el server, nunca el cliente.
3. **Validación previa**: el caller (smart component) debe verificar que el cliente tenga datos mínimos (`name`, `doc_number`).
4. **IVA**: la EF carga `tax_config` y aplica la fórmula canónica (ver `parqueadero-backend/specs/tax-config.spec.md`).

## Flujo
1. UseCase valida inputs.
2. Llama `InvoicingRepository.requestInvoice(params)`.
3. Repository invoca EF `request-invoice` via `supabase.functions.invoke('request-invoice', { body })`.
4. EF: verifica sesión → nextval_invoices → calcula IVA → INSERT invoice → UPDATE payment.invoice_id → return.

## Out of scope
- Facturación electrónica DIAN (Siigo, dian-fe-service): descartada del alcance.
- Reenvío / contingencia / CUFE: no aplica para ticket interno.

## Dependencias
- EF `request-invoice` (ver `parqueadero-backend/CLAUDE.md §7.1`)
- `app_settings.tax_config` cargado en la EF
- Sequence `invoice_number_seq` (migration 00007)
