# Spec: Edge Function `siigo-emit-invoice`

## Identificador
`backend/edge-functions/siigo-emit-invoice`

## Descripción
Edge Function Supabase (Deno) que emite una factura electrónica a través de **Siigo** (https://api.siigo.com). Reemplaza la EF `request-invoice` (ver `request-invoice.spec.md`, marcada como deprecada en Fase 11/S9). Es invocada desde el web cuando el cajero cierra una venta con el toggle "Emitir factura electrónica" activado.

Comportamiento general: **asíncrono**. Esta EF retorna apenas Siigo confirma recepción del documento; el estampado real puede tardar y se completa via cron (`siigo-poll-status`).

## Método y Ruta
`POST /functions/v1/siigo-emit-invoice`

## Autenticación
JWT de Supabase (Bearer token). Roles permitidos: `admin`, `operador`.

## Input (JSON Body)

```typescript
{
  session_id: string;           // UUID de parking_session 'completed'
  customer_id: string;          // UUID de customer (con o sin siigo_customer_id ya asignado)
  notes?: string | null;        // Observaciones internas (max 500 chars)
}
```

No acepta `reissue` ni `invoice_id` — el reintento se maneja con `siigo-emit-credit-note` (follow-up) o esperando que el cron pase la factura `Rejected`/`error_max_retries` y se invoque manualmente desde la UI con un botón "Reintentar".

## Output (JSON Response)

### Éxito (201 Created)
La factura quedó persistida (en cualquier estado intermedio o final). Cuerpo: invoice JSON completo con `siigo_status`.

```typescript
{
  id: string;
  internal_number: string;          // 'FAC-2026-05-01-000001'
  siigo_id: string | null;          // ID interno de Siigo
  siigo_number: string | null;      // Consecutivo fiscal Siigo (puede ser null hasta Stamped)
  siigo_status: 'pending' | 'InProcess' | 'Sent' | 'Stamped' | 'Rejected';
  siigo_observations: string[];
  siigo_pdf_url: string | null;
  siigo_xml_url: string | null;
  siigo_qr_url: string | null;
  siigo_cufe: string | null;
  siigo_cude: string | null;
  customer_id: string;
  session_id: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  issued_at: string;                // ISO 8601
  requested_invoice: true;
  // ... demás columnas de invoices
}
```

### Idempotencia (200 OK)
Si ya existe invoice no-rechazada para el `session_id` → retorna la existente con 200.

### Errores
- `401 Unauthorized` — sin JWT válido.
- `403 Forbidden` — rol `contador` u otro no autorizado.
- `404 Not Found` — sesión o cliente no existen.
- `409 Conflict` — la salida se cerró contra mensualidad y `requested_invoice` es `true` (regla de negocio: NO emitir FE para mensualidad).
- `422 Unprocessable Entity` — sesión no `completed`, datos fiscales incompletos, monto $0 sin razón válida.
- `500 Internal Server Error` — error guardando invoice tras llamar a Siigo (cancelar en BD si fue parcial es responsabilidad del operador admin via `siigo_invoice_attempts`).
- `503 Service Unavailable` — Siigo Auth no disponible (no se pudo obtener token); invoice NO se crea, el cliente reintenta.

```typescript
{ error: string; details?: string }
```

## Reglas de Negocio

1. **Idempotencia por sesión**: si ya hay invoice con `siigo_status IN ('pending','InProcess','Sent','Stamped')` para `session_id` → retornar la existente (200). Si hay con `Rejected`/`error_max_retries` → permitir crear nueva (queda alineada al reintento).
2. **Bloqueo mensualidad**: si la sesión cerró contra plan mensual (`payment.method = 'mensual'` o equivalente, `monthly_plan_id IS NOT NULL` en parking_session, o `total_cents = 0` por mensualidad) → 409. La UI debe ya haber bloqueado el toggle, pero la EF defiende.
3. **Numeración interna**: `internal_number` se asigna via `nextval_invoices()` y se persiste antes de llamar a Siigo. Formato `FAC-YYYY-MM-DD-NNNNNN` (igual que hoy). NUNCA se asigna client-side.
4. **Numeración Siigo**: `siigo_number` viene del response de Siigo (`response.number` o `response.name` según API); se persiste tal cual lo devuelve Siigo. No se manipula.
5. **Cliente fiscal en Siigo**: antes de emitir, llamar a `ensureSiigoCustomer(customer)` (helper en `_shared/siigo/customer.ts`). Si `customers.siigo_customer_id` está vacío, hace `POST /v1/customers` y persiste el id retornado. Si Siigo responde 409 "ya existe" para el documento, hacer `GET /v1/customers?identification=<doc_number>` y guardar el id existente.
6. **IVA (precio con IVA incluido)**: cargar `app_settings.tax_config` antes de calcular. Aplicar `extractInvoiceAmounts(payment.amount_cents, taxConfig)` del helper `_shared/tax/extract.ts`. Ver fórmula canónica en `parqueadero-backend/specs/tax-config.spec.md`.
   - `total_cents = payment.amount_cents` (lo cobrado en caja).
   - `subtotal_cents = round(total_cents / (1 + iva_rate))`.
   - `tax_cents = total_cents - subtotal_cents`.
   - Si `iva_responsible=false`: `tax_cents=0`, `subtotal_cents=total_cents`, y NO incluir línea de impuesto en el payload Siigo.
   - El `id` de impuesto IVA en Siigo sigue venido por env `SIIGO_TAX_IVA_ID`. La tasa numérica se toma de `tax_config.iva_rate` (no de env), para que UI admin pueda cambiarla sin redeploy.
7. **Mapping a payload Siigo**: ver spec `_shared-siigo-client.spec.md` §`mapper.ts`.
8. **Stamp inmediato**: el payload incluye `stamp.send: true` y `mail.send: true` para que Siigo intente estampar y enviar al correo del cliente sin pasos extra.
9. **Persistencia ANTES de llamar a Siigo**: la invoice se inserta con `siigo_status='pending'` antes del `POST /v1/invoices` para que, si la EF cae mid-call, el polling (S5) la encuentre y termine el ciclo.
10. **Si Siigo responde 4xx (validación)**: UPDATE invoice con `siigo_status='Rejected'`, `siigo_last_error=<detalle>`. La EF retorna 201 (la factura quedó persistida en estado fallido — no es un error HTTP del cliente del operador).
11. **Si Siigo responde 5xx, 429, timeout o network error**: invoice queda en `siigo_status='pending'` con `siigo_attempts=1`. El cron polling (S5) reintenta. La EF retorna 201 con la invoice en `pending`.
12. **Auditoría**: cada llamada HTTP (auth, customer upsert, emit) registra una fila en `siigo_invoice_attempts` con `request_body`, `response_body` (con `Authorization: Bearer <redacted>`), `http_status`, `latency_ms`. Ver spec `_shared-siigo-client.spec.md`.
13. **Vincular pago**: tras inserción exitosa, `UPDATE payments SET invoice_id = invoice.id WHERE session_id = ?` (manteniendo el comportamiento actual de `request-invoice`).
14. **Modo mock local**: si las variables `SIIGO_USERNAME` o `SIIGO_ACCESS_KEY` están vacías, la EF entra en **modo mock**:
    - **NO** llama a `getSiigoToken()` ni a `ensureSiigoCustomer()`.
    - **NO** hace ningún HTTP a `api.siigo.com`.
    - **NO** registra filas en `siigo_invoice_attempts` (no hay llamadas que auditar).
    - Después del INSERT inicial, hace UPDATE inmediato simulando respuesta exitosa:
      `siigo_status='Stamped'`, `siigo_id='mock-<uuid>'`, `siigo_number='MOCK-<seq>'`,
      `siigo_cufe='MOCK-CUFE-<uuid>'`, `siigo_cude=null`, `siigo_pdf_url=null`,
      `siigo_xml_url=null`, `siigo_qr_url=null`, `siigo_observations=['Modo mock local — sin proveedor configurado']`,
      `siigo_attempts=0`, `siigo_last_attempt_at=now()`, `siigo_last_error=null`.
    - El trigger `sync_dian_from_siigo` deriva `dian_status='accepted'` por el `Stamped`.
    - Útil para desarrollo/QA local sin sandbox Siigo y para pruebas de UI offline.
    - **Producción debe tener las dos variables pobladas**, de lo contrario emitirá facturas con CUFE falso. Documentar esto en runbook.

## Flujo

```
1. Verificar JWT → user, role
2. Body parse → { session_id, customer_id, notes? }
3. Cargar parking_session: status='completed', no es mensualidad → si falla → 422/409
4. Cargar payment: total_cents, status='completed'
5. Idempotencia: SELECT invoice WHERE session_id=? AND siigo_status IN ('pending','InProcess','Sent','Stamped')
   ↳ existe → return 200 con invoice
6. Cargar customer; validar doc_type, doc_number, name, email no vacíos → 422 si falta algo
7. ensureSiigoCustomer(customer)  // → siigo_customer_id
8. nextval_invoices()              // → seq
9. INSERT invoices {
     internal_number, customer_id, session_id, subtotal_cents, tax_cents, total_cents,
     siigo_status='pending', requested_invoice=true, payment_id, ...
   }
10. payload = toSiigoInvoicePayload(invoice, customer, payment)
11. siigoFetch('/v1/invoices', { method:'POST', body: payload })  // SI no es mock mode
    ↳ 201 + stamp.status='Stamped'
       UPDATE invoice SET siigo_id, siigo_number, siigo_cufe, siigo_pdf_url, siigo_status='Stamped'
    ↳ 201 + stamp.status='InProcess'/'Sent'
       UPDATE invoice SET siigo_id, siigo_status=<status mapeado>, siigo_attempts=0
    ↳ 4xx (validación)
       UPDATE invoice SET siigo_status='Rejected', siigo_last_error=<detalle>
    ↳ 5xx / 429 / timeout / network
       UPDATE invoice SET siigo_attempts=1, siigo_last_error=<msg>
       (siigo_status sigue en 'pending'; cron reintenta)

11b. SI mock mode (SIIGO_USERNAME/ACCESS_KEY vacíos):
       UPDATE invoice SET siigo_status='Stamped',
                          siigo_id='mock-<uuid>', siigo_number='MOCK-<seq>',
                          siigo_cufe='MOCK-CUFE-<uuid>',
                          siigo_observations=['Modo mock local — sin proveedor configurado']
       (sin HTTP, sin auditar siigo_invoice_attempts)
12. UPDATE payments SET invoice_id WHERE session_id=?
13. SELECT invoice (estado actual) → return 201
```

## Trigger derivación `dian_status`

El trigger `BEFORE UPDATE OR INSERT` en `invoices` (definido en migration `00013`) deriva el campo legacy `dian_status` desde `siigo_status`:

| siigo_status | dian_status |
|---|---|
| `Stamped` | `accepted` |
| `Rejected` | `rejected` |
| `pending`, `InProcess`, `Sent` | `pending` o `sent` |
| `queued_offline` | `contingency` |
| `error_max_retries` | `contingency` |

Esta EF NO escribe `dian_status` directamente — el trigger lo hace.

## Variables de entorno (Supabase secrets)

```
SIIGO_USERNAME
SIIGO_ACCESS_KEY
SIIGO_PARTNER_ID
SIIGO_BASE_URL=https://api.siigo.com
SIIGO_DOCUMENT_TYPE_ID         # id de tipo FV electrónica
SIIGO_SELLER_ID
SIIGO_PRODUCT_ID_PARKING_HOUR
SIIGO_PRODUCT_ID_MONTHLY_PLAN
SIIGO_PAYMENT_CASH_ID
SIIGO_PAYMENT_CARD_CREDIT_ID
SIIGO_PAYMENT_CARD_DEBIT_ID
SIIGO_PAYMENT_TRANSFER_ID
SIIGO_PAYMENT_NEQUI_ID
SIIGO_PAYMENT_DAVIPLATA_ID
SIIGO_TAX_IVA_ID
SIIGO_TAX_IVA_PERCENT=19
SIIGO_HTTP_TIMEOUT_MS=28000
```

## Dependencias

- Tablas: `invoices`, `customers`, `parking_sessions`, `payments`, `siigo_invoice_attempts`, `siigo_auth_tokens`.
- RPC: `nextval_invoices()`.
- Helpers: `_shared/siigo/{auth,client,customer,mapper}.ts` (ver spec `_shared-siigo-client.spec.md`).
- API externa: `https://api.siigo.com/v1/invoices` y `/auth`, `/v1/customers`.

## Casos borde

- **Cliente sin `siigo_customer_id` y Siigo retorna 409 "documento ya existe"**: hacer `GET /v1/customers?identification=<doc>` y guardar el id existente. Reintentar la emisión.
- **Token Siigo expira mid-emisión**: `siigoFetch` revalida si `expires_at - now() < 5min` antes de cada call.
- **Race condition: dos requests para el mismo session_id**: el `INSERT` no tiene constraint UNIQUE por sesión (porque las rechazadas pueden coexistir). La idempotencia se hace via SELECT previo. En el worst case, doble emisión a Siigo: una de las dos será 409 "documento duplicado" (por consecutivo interno) y se manejará como Rejected.
- **Total $0 con `requested_invoice=true` en sesión NO mensualidad**: permitir (cortesía manual con FE solicitada). Siigo acepta facturas $0.

## Out of scope (follow-ups)

- **Notas crédito**: anulación de facturas `Stamped` requiere `siigo-emit-credit-note` (no existe aún).
- **Reintento manual por UI**: botón "Reintentar" en `invoices-list` solo aplica a `Rejected`/`error_max_retries`. Comportamiento detallado en `parqueadero-web/specs/features/invoicing/reissue-invoice.spec.md`.
