# Spec: Módulo compartido `_shared/siigo/`

## Identificador
`backend/edge-functions/_shared/siigo`

## Descripción
Módulo TypeScript común a las Edge Functions `siigo-emit-invoice` y `siigo-poll-status`. NO es una Edge Function por sí mismo — es código importado por las dos. Centraliza:

- Autenticación + cache de token Siigo (24 h).
- Cliente HTTP con timeout, retry, auditoría.
- Upsert de cliente fiscal (terceros) en Siigo.
- Mapper de `InvoiceEntity + customer + payment` → payload Siigo.
- Tipos TypeScript de los responses Siigo.
- Mapeo de errores Siigo → códigos internos.

## Estructura de archivos

```
supabase/functions/_shared/siigo/
├── auth.ts        — getSiigoToken(client)
├── client.ts      — siigoFetch(token, path, init)
├── customer.ts    — ensureSiigoCustomer(client, customerId)
├── mapper.ts      — toSiigoInvoicePayload(invoice, customer, payment, items)
├── poll-mapper.ts — mapStampStatus(siigoResponse) → SiigoStatusInternal
├── types.ts       — Interfaces Siigo (Auth, Customer, Invoice, Status)
└── errors.ts      — Mapeo HTTP Siigo → SiigoErrorCode
```

## `auth.ts`

### Contrato
```typescript
export async function getSiigoToken(
  serviceClient: SupabaseClient,
): Promise<string>;
```

### Comportamiento
1. `SELECT access_token, expires_at FROM siigo_auth_tokens WHERE id = 1`.
2. Si `expires_at - now() > 5 min` → retornar `access_token` cacheado.
3. Si vacío o por expirar:
   - `POST ${SIIGO_BASE_URL}/auth` con body `{ username: SIIGO_USERNAME, access_key: SIIGO_ACCESS_KEY }` y header `Partner-Id: SIIGO_PARTNER_ID`.
   - Persistir en `siigo_invoice_attempts`: `operation='auth'`, `http_status`, `latency_ms`. **NO** persistir `access_key` ni `access_token` en cuerpo (sanitizar antes de insert).
   - `UPSERT siigo_auth_tokens (id=1, access_token, expires_at = now() + interval '23 hours', fetched_at = now())`. Usamos 23 h en lugar de 24 h para tener margen.
4. Re-entrante: dos invocaciones simultáneas pueden traer dos tokens — el último UPSERT gana, no rompe nada.
5. Si `POST /auth` falla (401, 5xx, network): lanzar `SiigoAuthError` con detalle. La EF caller decide cómo retornar (`siigo-emit-invoice` → 503; `siigo-poll-status` → 503 + cron sigue al siguiente tick).

### Sanitización para auditoría
```typescript
const sanitizedBody = { ...payload, access_key: '<redacted>' };
const sanitizedHeaders = { ...headers, Authorization: 'Bearer <redacted>' };
```

## `client.ts`

### Contrato
```typescript
export async function siigoFetch(
  serviceClient: SupabaseClient,
  invoiceId: string | null,           // null para auth/customer-upsert standalone
  operation: SiigoOperation,          // 'emit' | 'poll' | 'customer_upsert' | 'auth'
  token: string,
  path: string,                       // ej. '/v1/invoices'
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown; latencyMs: number }>;
```

### Comportamiento
1. `start = performance.now()`.
2. `fetch` con timeout 28 s (env `SIIGO_HTTP_TIMEOUT_MS`).
3. Headers automáticos:
   - `Authorization: Bearer ${token}`
   - `Partner-Id: ${SIIGO_PARTNER_ID}`
   - `Content-Type: application/json` (si init.body)
4. Retry interno (1 vez) en caso de:
   - HTTP 429 → esperar 3 s antes de retry (Siigo rate limit).
   - HTTP 5xx → esperar 1 s antes de retry.
   - Network error / timeout → no retry; deja al caller decidir.
5. Persistir en `siigo_invoice_attempts`:
   - `invoice_id` (puede ser null si la operación no liga aún a un invoice — auth y customer pre-emit).
   - `attempt_number` (autoincrement por `(invoice_id, operation)` con un `COUNT(*) + 1` o secuencia simple).
   - `operation`, `http_method`, `http_url` (sin query strings sensibles), `http_status`, `latency_ms`.
   - `request_body` y `response_body` JSONB; sanitizar headers/tokens antes de persistir.
   - Si error: `error_message`.
6. Retornar tupla `{ ok, status, body, latencyMs }`. Caller decide qué hacer con cada caso.

## `customer.ts`

### Contrato
```typescript
export async function ensureSiigoCustomer(
  serviceClient: SupabaseClient,
  token: string,
  customer: CustomerRow,            // {id, doc_type, doc_number, name, email, phone, address, municipio, departamento, siigo_customer_id, ...}
): Promise<{ siigoCustomerId: string; created: boolean }>;
```

### Comportamiento
1. Si `customer.siigo_customer_id` ya existe → retornar `{ siigoCustomerId, created: false }`.
2. `POST /v1/customers` con payload Siigo:
   ```typescript
   {
     person_type: customer.doc_type === 'nit' ? 'Company' : 'Person',
     id_type: { code: mapDocType(customer.doc_type) },  // CC=13, NIT=31, CE=22, PA=41
     identification: customer.doc_number,
     check_digit: customer.dv ?? null,
     name: customer.doc_type === 'nit'
       ? [customer.name]
       : splitNamesOrFallback(customer.name),  // Siigo Person quiere ['firstName', 'lastName']
     commercial_name: customer.name,
     branch_office: 0,
     active: true,
     vat_responsible: customer.responsabilidades_fiscales?.includes('R-99-PN') ?? false,
     fiscal_responsibilities: mapFiscalResponsibilities(customer.responsabilidades_fiscales),
     address: customer.address ? {
       address: customer.address,
       city: { country_code: 'Co', state_code: customer.departamento ?? '', city_code: customer.municipio ?? '' },
     } : undefined,
     phones: customer.phone ? [{ indicative: '57', number: customer.phone }] : [],
     contacts: customer.email ? [{
       first_name: customer.name.split(' ')[0],
       last_name: customer.name.split(' ').slice(1).join(' ') || customer.name,
       email: customer.email,
     }] : [],
   }
   ```
3. Manejar respuestas:
   - `201` → `siigo_customer_id = response.id`. UPDATE `customers SET siigo_customer_id, siigo_synced_at = now()`.
   - `409` (documento ya existe) → `GET /v1/customers?identification=<doc_number>`, leer el primer match, persistir id.
   - `4xx` (validación) → guardar `customers.siigo_sync_error = <detalle>` y lanzar `SiigoCustomerError`. La EF caller retorna 422 al cliente.
   - `5xx`, timeout → lanzar `SiigoNetworkError`. EF caller retorna 503 (caso `siigo-emit-invoice`) o reintenta en próximo tick (no aplica para customer en poll).

### Helpers
- `mapDocType('cedula') → 13` (CC), `'nit' → 31`, `'pasaporte') → 41`, `default → 13`.
- `splitNamesOrFallback(fullName)`: si tiene espacio, `[firstName, restAsLastName]`. Si no, `[fullName, fullName]` (Siigo exige ambos para Person).
- `mapFiscalResponsibilities(string[])`: pass-through si los códigos ya cumplen estándar DIAN (R-99-PN, etc.); si no, devolver `[]`.

## `mapper.ts`

### Contrato
```typescript
export function toSiigoInvoicePayload(
  invoice: InvoiceRow,
  customer: CustomerRow,
  payment: PaymentRow,
  items: InvoiceItem[],   // siempre 1+ items, derivados de la sesión
): SiigoInvoicePayload;
```

### Estructura del payload (referencia API Siigo)

```typescript
{
  document: { id: SIIGO_DOCUMENT_TYPE_ID },
  date: invoice.issued_at.slice(0, 10),                  // YYYY-MM-DD
  customer: {
    identification: customer.doc_number,
    branch_office: 0,
  },
  cost_center: undefined,                                 // por ahora omitido
  currency: { code: 'COP', exchange_rate: 1 },
  seller: SIIGO_SELLER_ID,
  observations: invoice.notes ?? '',
  items: items.map(item => ({
    code: item.siigoProductCode,                          // SIIGO_PRODUCT_ID_PARKING_HOUR | _MONTHLY_PLAN
    description: item.description,
    quantity: item.quantity,
    price: item.unitPriceCents / 100,                     // Siigo espera pesos, no centavos
    discount: 0,
    taxes: [{ id: SIIGO_TAX_IVA_ID }],                    // 19 %
  })),
  payments: [{
    id: mapPaymentMethod(payment.method),                 // SIIGO_PAYMENT_CASH_ID, etc.
    value: invoice.total_cents / 100,
    due_date: invoice.issued_at.slice(0, 10),
  }],
  stamp: { send: true },                                  // Siigo firma + envía DIAN inmediatamente
  mail: { send: !!customer.email },                       // Solo si hay email
}
```

### Item builder

Por ahora, **un solo item por factura**:
- Sesiones de parqueo: `description = 'Parqueo ${vehicle_plate} ${entry_at} → ${exit_at}'`, `code = SIIGO_PRODUCT_ID_PARKING_HOUR`, `quantity = 1`, `price = subtotal_cents / 100`.
- (Futuro) Cobros de plan mensual cuando se facture el plan: `code = SIIGO_PRODUCT_ID_MONTHLY_PLAN` — fuera de scope Fase 11.

### `mapPaymentMethod(method)` → siigo payment.id

```typescript
'efectivo'        → SIIGO_PAYMENT_CASH_ID
'tarjeta'         → SIIGO_PAYMENT_CARD_CREDIT_ID    // default; si hay 'tarjeta_credito'/'tarjeta_debito' explícito, usar el específico
'tarjeta_credito' → SIIGO_PAYMENT_CARD_CREDIT_ID
'tarjeta_debito'  → SIIGO_PAYMENT_CARD_DEBIT_ID
'transferencia'   → SIIGO_PAYMENT_TRANSFER_ID
'nequi'           → SIIGO_PAYMENT_NEQUI_ID
'daviplata'       → SIIGO_PAYMENT_DAVIPLATA_ID
'mensual'         → throw — esta EF no debe ser invocada para mensualidad (regla del bloqueo)
```

## `poll-mapper.ts`

### Contrato
```typescript
export interface SiigoStampInfo {
  status: SiigoStatusInternal;
  cufe: string | null;
  cude: string | null;
  number: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  qrUrl: string | null;
  observations: string[];
}

export function mapStampStatus(siigoInvoiceResponse: any): SiigoStampInfo;
```

Lectura tolerante a variaciones de la respuesta Siigo:
- `stamp.status` → status interno (ver tabla en `siigo-poll-status.spec.md`).
- `stamp.cufe`, `stamp.cude`, `stamp.identifier`.
- `metadata.created` → `created` (no se usa, solo para debug).
- `additional_fields.pdf_url`, `xml_url`, `qr_url`.
- `errors[]` o `stamp.observations[]` → array de strings.

## `types.ts`

```typescript
export type SiigoStatusInternal =
  | 'pending' | 'InProcess' | 'Sent'
  | 'Stamped' | 'Rejected'
  | 'queued_offline' | 'error_max_retries';

export type SiigoOperation = 'auth' | 'customer_upsert' | 'emit' | 'poll';

export interface SiigoAuthResponse {
  access_token: string;
  expires_in: number;            // segundos
  scope: string;
  token_type: 'Bearer';
}

export interface SiigoCustomerCreatedResponse { id: string; /* ... */ }

export interface SiigoInvoiceResponse {
  id: string;
  number: number;
  name: string;                  // ej. 'FV-1-1'
  date: string;
  customer: { id: string; identification: string };
  total: number;
  balance: number;
  stamp: { status: string; cufe?: string; observations?: string[] };
  // ... resto
}

// ... etc
```

## `errors.ts`

```typescript
export class SiigoAuthError extends Error {}
export class SiigoCustomerError extends Error { constructor(public details: unknown) { super('Siigo customer error'); } }
export class SiigoNetworkError extends Error {}
export class SiigoValidationError extends Error { constructor(public siigoErrors: any[]) { super('Siigo validation error'); } }

export function classifySiigoError(status: number, body: unknown): SiigoErrorClass {
  if (status === 401 || status === 403) return 'auth';
  if (status === 422 || status === 400) return 'validation';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'unknown';
}
```

## Casos borde

- **`siigoFetch` con token expirado → 401**: el caller debe recargar token via `getSiigoToken(refresh=true)` (parámetro opcional para forzar bypass de cache) y reintentar 1 vez.
- **Customer con `doc_number` que no es único en Siigo**: 409. El handler vuelve a hacer GET por documento.
- **Headers grandes**: Siigo rechaza requests > N kB. Limitar `observations` a 500 chars (reflejado en `notes` ya en el spec del UseCase web).

## Out of scope

- Notas crédito (`siigo-emit-credit-note`) — follow-up.
- Múltiples items por factura (cuando una factura agrupe varias sesiones) — follow-up.
- Resolución y prefijo dinámicos por sede — Fase 11 asume una sola sede por instancia (env var única).
