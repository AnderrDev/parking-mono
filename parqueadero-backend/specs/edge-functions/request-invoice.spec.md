# Spec: Edge Function `request-invoice`

## Identificador
`backend/edge-functions/request-invoice`

## Descripción
Edge Function Supabase que orquesta la emisión de facturas electrónicas: asigna número de factura, llama a `dian-fe-service` (o stub si `DIAN_FE_SERVICE_URL` no está configurado), persiste el resultado en `invoices` y retorna la factura.

## Método y Ruta
`POST /functions/v1/request-invoice`

## Autenticación
JWT de Supabase (Bearer token). Roles permitidos: `admin`, `operador`, `contador`.

## Input (JSON Body)

```typescript
{
  session_id: string;       // UUID de parking_session completada
  customer_id: string;      // UUID de customer con datos fiscales completos
  notes?: string | null;    // Observaciones (max 500 chars)
  reissue?: boolean;        // true = reintentar factura existente
  invoice_id?: string;      // Requerido si reissue = true
}
```

## Output (JSON Response)

```typescript
// Éxito (200)
{
  id: string;
  invoice_number: string;       // 'FAC-2026-04-29-0001'
  cufe: string;
  dian_status: string;          // 'accepted' | 'contingency' | 'rejected'
  dian_messages: string[];
  xml_url: string | null;
  pdf_url: string | null;
  issued_at: string;            // ISO 8601
  amount_cents: number;
  customer_name: string;
}

// Error (4xx / 5xx)
{ error: string; details?: string }
```

## Reglas de Negocio

1. **Numeración secuencial**: Usar `nextval('invoices_number_seq')` en PostgreSQL. El número tiene formato `FAC-YYYY-MM-DD-NNNNNN`. NUNCA asignado por el cliente.
2. **Reemisión**: Si `reissue = true`, cargar factura existente por `invoice_id`, mantener el número y llamar de nuevo al servicio DIAN.
3. **Estado 'accepted' bloqueante**: Si la sesión ya tiene factura `accepted`, retornar 409 Conflict.
4. **Stub vs real**: Si `DIAN_FE_SERVICE_URL` está vacía o ausente → usar stub. La respuesta del stub tiene exactamente la misma forma que la respuesta real del `dian-fe-service`.
5. **IVA**: `tax_cents = Math.round(amount_cents * 0.19)`, `total_cents = amount_cents + tax_cents`.
6. **Timeout DIAN**: Si el servicio tarda > 28 s → guardar con `dian_status = 'contingency'`, retornar 200 con ese estado.

## Stub (cuando `DIAN_FE_SERVICE_URL` no está configurado)

```typescript
// Retorna MISMO shape que dian-fe-service/specs/emit-invoice.spec.md
{
  success: true,
  invoice_number: invoiceNumber,   // ya asignado por la EF
  cufe: `STUB-${crypto.randomUUID()}`,
  dian_status: 'accepted',
  xml_url: null,
  pdf_url: null,
  issued_at: new Date().toISOString(),
}
```

## Flujo

```
1. Verificar JWT → obtener userId y rol
2. Leer parking_session (debe ser 'completed')
3. Leer customer (validar datos fiscales: nombre, doc, email)
4. Si reissue=true: cargar invoice existente; si no: verificar que no hay accepted
5. Asignar número de factura (nextval)
6. Construir payload para dian-fe-service:
   { customer_name, customer_doc_type, customer_doc_number,
     invoice_type: '01', subtotal_cents, tax_cents, total_cents,
     internal_number, parking_session_ids: [session_id] }
7. POST a DIAN_FE_SERVICE_URL o ejecutar stub
8. INSERT/UPDATE en invoices:
   { invoice_number, cufe, dian_status, dian_messages,
     xml_url, pdf_url, issued_at, session_id, customer_id,
     amount_cents, tax_cents, total_cents }
9. UPDATE payments SET invoice_id = nuevaFactura.id WHERE session_id = session_id
10. Retornar invoice JSON
```

## Secuencia en BD

```sql
-- Debe existir (migration 00007):
CREATE SEQUENCE IF NOT EXISTS invoices_number_seq START 1;
```

El número de factura se forma en la Edge Function:
```typescript
const seq = await supabase.rpc('nextval_invoices');
const invoiceNumber = `FAC-${year}-${month}-${day}-${String(seq).padStart(6, '0')}`;
```

## Dependencias
- `invoices` table
- `parking_sessions` table (leer datos de sesión)
- `customers` table (leer datos fiscales)
- `payments` table (actualizar `invoice_id`)
- Env: `DIAN_FE_SERVICE_URL` (opcional; si vacía → stub)
- Supabase Storage bucket `invoices/` (para XML/PDF, cuando aplique)
