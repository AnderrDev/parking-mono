# Spec: Solicitar Factura Electrónica (vía Siigo)

## Identificador
`invoicing/request-invoice`

> **Actualizado en Fase 11 / S1**: ahora la emisión va por **Siigo** (no DIAN directo). El UseCase mantiene su nombre y firma para minimizar churn en el caller, pero la datasource invoca la EF `siigo-emit-invoice` en lugar de `request-invoice`.

## Descripción
UseCase que solicita la emisión de una factura electrónica para una sesión de parking ya cerrada. Invoca la Edge Function `siigo-emit-invoice` que:
1. Asegura el cliente fiscal en Siigo (`siigo_customer_id` se crea on-demand si falta).
2. Asigna `internal_number` (consecutivo operacional propio).
3. Llama a Siigo (`POST /v1/invoices` con `stamp.send: true`).
4. Persiste la factura en `invoices` con `siigo_status` inicial.

Comportamiento **asíncrono**: el UseCase retorna apenas Siigo confirma recepción. El estampado real (paso `Stamped`) puede tardar; la UI lo refresca via Realtime (ver `siigo-status-realtime.spec.md`).

## Actor
Operador, Admin (en el momento del cobro o a posteriori).

## Pre-condiciones
- Usuario autenticado.
- La sesión de parking tiene `status = 'completed'` y un pago asociado.
- La sesión NO se cerró contra plan mensual (`paymentMethod !== 'mensual'`). Si lo es, esta UseCase NO debe invocarse — la UI bloquea el toggle.
- El cliente (`customerId`) existe y tiene datos fiscales válidos: `doc_type`, `doc_number`, `name`, `email`. Si falta alguno, el `vehicle-exit-dialog` los captura inline (ver `cashier-fiscal-data-capture.spec.md`) y los persiste vía `UpdateCustomerUseCase` antes de invocar este UseCase.
- No existe factura no-rechazada para la misma sesión (idempotencia validada en la EF, pero el UseCase puede pre-validar localmente).

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| sessionId | string (UUID) | Sí | Sesión completada, no mensual |
| customerId | string (UUID) | Sí | Cliente con datos fiscales completos |
| notes | string \| null | No | Observaciones (max 500 chars) |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<InvoiceEntity>` | Factura persistida (cualquier `siigoStatus` no terminal o `Stamped`) |
| Sesión no válida | `Left<NotFoundFailure>` | Sesión no existe |
| Sesión incompleta o mensual | `Left<BusinessRuleFailure>` | `status != 'completed'` o `paymentMethod = 'mensual'` |
| Cliente incompleto | `Left<ValidationFailure>` | Faltan datos fiscales |
| Factura ya emitida | `Left<BusinessRuleFailure>` | Ya hay invoice no-rechazada para esa sesión |
| Siigo Auth caído | `Left<NetworkFailure>` | `siigo-emit-invoice` retornó 503 |
| Error servidor | `Left<ServerFailure>` | EF falló por otra causa |

## Reglas de Negocio

1. **Numeración interna**: la EF asigna `internalNumber` via `nextval_invoices()` (existente). Formato `FAC-YYYY-MM-DD-NNNNNN`. NUNCA del cliente.
2. **Numeración fiscal**: el `siigoNumber` lo asigna Siigo y aparece en la entidad cuando `siigoStatus = 'Stamped'` (puede no estar en el primer retorno si Siigo todavía está procesando).
3. **IVA**: 19 % sobre el `subtotal_cents` del payment. La EF aplica `tax_cents = round(subtotal_cents * 0.19)`, `total_cents = subtotal_cents + tax_cents`.
4. **Bloqueo plan mensual**: si la sesión cierra contra mensualidad, esta UseCase no se invoca. Si por error se invoca, la EF responde 409 → mapeamos a `BusinessRuleFailure`.
5. **Idempotencia**: si ya hay invoice no-rechazada para `session_id`, la EF retorna 200 con la existente. El UseCase la propaga como `Right(invoice)` sin nuevo registro.
6. **Estados intermedios visibles**: la entidad retornada puede tener `siigoStatus = 'pending' | 'InProcess' | 'Sent' | 'Stamped'`. La UI maneja todos como "éxito local — esperar confirmación" salvo `Stamped` que es "listo".
7. **Observabilidad**: tras retornar el Right, el caller suele suscribirse al Realtime (`ObserveInvoiceStatusUseCase`) para refrescar cuando Siigo confirme.

## Flujo Principal

1. UseCase valida `sessionId`, `customerId`, `notes` (length).
2. Llama a `InvoicingRepository.requestInvoice(params)`.
3. Repository invoca EF `siigo-emit-invoice` via `supabase.functions.invoke('siigo-emit-invoice', { body })`.
4. EF: ensureSiigoCustomer → nextval_invoices → INSERT invoice (pending) → POST Siigo → UPDATE invoice según respuesta → return.
5. UseCase mapea response → `InvoiceEntity` y retorna `Right(entity)`.

## Contrato JSON con la EF `siigo-emit-invoice`

### Request body
```json
{
  "session_id": "uuid",
  "customer_id": "uuid",
  "notes": "string | null"
}
```

### Response (201 Created — éxito o estado intermedio)
```json
{
  "id": "uuid",
  "internal_number": "FAC-2026-05-01-000001",
  "siigo_id": "uuid-siigo | null",
  "siigo_number": "FV-1-1 | null",
  "siigo_status": "pending | InProcess | Sent | Stamped | Rejected",
  "siigo_observations": [],
  "siigo_pdf_url": "https://... | null",
  "siigo_xml_url": "https://... | null",
  "siigo_qr_url": "https://... | null",
  "siigo_cufe": "string | null",
  "siigo_cude": "string | null",
  "customer_id": "uuid",
  "session_id": "uuid",
  "subtotal_cents": 500000,
  "tax_cents": 95000,
  "total_cents": 595000,
  "issued_at": "2026-05-01T14:35:30Z",
  "requested_invoice": true
}
```

### Response (4xx/5xx)
```json
{ "error": "Mensaje", "details": "string opcional" }
```

## Edge Cases

- **Sesión con `amountCents = 0` (cortesía con FE solicitada)**: factura válida por $0; Siigo lo acepta. La entidad sale con `total_cents = 0`.
- **Siigo retorna 4xx (validación)**: la factura se persiste con `siigo_status='Rejected'` y `siigo_last_error`. UseCase retorna `Right(entity)` (la factura existe en BD aunque rechazada). El caller decide UX (toast con error, opción de reintentar).
- **Siigo timeout / 5xx**: factura queda en `pending`, `siigo_attempts=1`. UseCase retorna `Right(entity)`. El cron polling toma el relevo; UI refresca via Realtime.
- **Reintento por idempotencia**: dos clicks rápidos del cajero → la EF detecta invoice existente y retorna la misma. El UseCase ve `Right(entity)` igual; no duplica.

## Manejo offline

Si la app está offline cuando el cajero submit con FE solicitada:
- El cierre de sesión va a cola PowerSync (Fase 8).
- La invocación a la EF NO se hace; en su lugar, el repository hace `INSERT invoices` directo en cache local con `siigo_status='queued_offline'`, `requested_invoice=true`, `internal_number` ya asignado por la sequence local (PowerSync replica la sequence del server-side al sync).
- Toast: "Factura encolada — se emitirá al recuperar conexión".
- Cuando vuelve red, un usecase `flush-offline-invoices` (a definir en Fase 8) recorre `queued_offline` y llama `siigo-emit-invoice` por cada una. Si la EF responde 409 (idempotencia), se considera ya emitida.

## Dependencias

- `InvoicingRepository.requestInvoice(params)` → invoca EF
- EF `siigo-emit-invoice` (ver `parqueadero-backend/specs/edge-functions/siigo-emit-invoice.spec.md`)
- `UpdateCustomerUseCase` (caller lo usa antes si aplica)

## Mapping a UI

- **Invocación**: `vehicle-exit-dialog` → toggle "Emitir factura electrónica" (existente). Detalles del flujo en `cashier-fiscal-data-capture.spec.md`.
- **Feedback**: 
  - Si `siigoStatus = 'Stamped'`: toast "Factura emitida #{siigo_number}".
  - Si `siigoStatus = 'pending'/'InProcess'/'Sent'`: toast "Factura en proceso (interno: {internal_number}). Estado se actualizará en la lista."
  - Si `siigoStatus = 'Rejected'`: toast "Factura rechazada por DIAN: {siigo_last_error}. Reintenta o consulta admin."

## Cambios respecto a la versión Fase 9 (stub DIAN)

| Antes (Fase 9) | Ahora (Fase 11) |
|---|---|
| EF `request-invoice` | EF `siigo-emit-invoice` |
| Campo `number` | Campo `internalNumber` (renombrado) |
| Campo `cufe` (stub) | Campo `siigoCufe` (real cuando Stamped) |
| Sin estado intermedio asíncrono | `siigoStatus` evoluciona; Realtime refresca |
| Reissue por la misma EF (`reissue=true`) | Reissue solo aplica a `Rejected/error_max_retries` (ver `reissue-invoice.spec.md`) |
| `dian_status` autoritativo | `dian_status` derivado por trigger desde `siigo_status` |
