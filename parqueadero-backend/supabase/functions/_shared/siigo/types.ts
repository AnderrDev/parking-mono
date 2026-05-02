// Tipos compartidos para la integración Siigo.
// Spec: specs/edge-functions/_shared-siigo-client.spec.md §"types.ts"

/** Estado interno del ciclo de vida fiscal de la factura.
 *  Coincide con el CHECK de la columna `invoices.siigo_status` en la migration 00013.
 *  Los valores `pending|InProcess|Sent|Stamped|Rejected` reflejan el `stamp.status`
 *  que devuelve Siigo. `queued_offline` y `error_max_retries` son internos.
 */
export type SiigoStatusInternal =
  | 'pending'
  | 'InProcess'
  | 'Sent'
  | 'Stamped'
  | 'Rejected'
  | 'queued_offline'
  | 'error_max_retries';

/** Operación auditada en `siigo_invoice_attempts.operation`. */
export type SiigoOperation = 'auth' | 'customer_upsert' | 'emit' | 'poll';

/** Respuesta de POST https://api.siigo.com/auth */
export interface SiigoAuthResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

/** Doc types Siigo (catálogo /v1/document-types). */
export interface SiigoDocTypeId {
  code: number;
}

/** Payload mínimo de POST /v1/customers. */
export interface SiigoCustomerCreatePayload {
  person_type: 'Person' | 'Company';
  id_type: SiigoDocTypeId;
  identification: string;
  check_digit?: number | null;
  name: string[];
  commercial_name?: string;
  branch_office?: number;
  active?: boolean;
  vat_responsible?: boolean;
  fiscal_responsibilities?: { code: string }[];
  address?: {
    address: string;
    city: { country_code: string; state_code: string; city_code: string };
  };
  phones?: { indicative: string; number: string }[];
  contacts?: { first_name: string; last_name: string; email: string; phone?: { indicative: string; number: string } }[];
}

/** Respuesta de POST /v1/customers. */
export interface SiigoCustomerResponse {
  id: string;
  identification: string;
  name: string[] | string;
  active: boolean;
  // ... más campos no usados por nosotros
}

/** Respuesta de GET /v1/customers?identification={doc} */
export interface SiigoCustomerListResponse {
  results: SiigoCustomerResponse[];
  pagination?: { total_results: number; page_size: number; page: number };
}

/** Item dentro del payload de invoice. */
export interface SiigoInvoiceItem {
  code: string;
  description: string;
  quantity: number;
  price: number; // pesos (no centavos)
  discount?: number;
  taxes?: { id: number }[];
}

/** Payment dentro del payload de invoice. */
export interface SiigoInvoicePayment {
  id: number;
  value: number; // pesos
  due_date: string; // YYYY-MM-DD
}

/** Payload completo de POST /v1/invoices. */
export interface SiigoInvoicePayload {
  document: { id: number };
  date: string; // YYYY-MM-DD
  customer: { identification: string; branch_office?: number };
  cost_center?: number;
  currency?: { code: string; exchange_rate: number };
  seller: number;
  observations?: string;
  items: SiigoInvoiceItem[];
  payments: SiigoInvoicePayment[];
  stamp?: { send: boolean };
  mail?: { send: boolean };
}

/** Respuesta de POST /v1/invoices y GET /v1/invoices/{id}. */
export interface SiigoInvoiceResponse {
  id: string;
  document?: { id: number };
  number?: number;
  name?: string;
  date?: string;
  customer?: { id: string; identification: string };
  total?: number;
  balance?: number;
  /** Estado del estampado DIAN. Valores observados: Stamped, Sent, InProcess, Rejected, Pending. */
  stamp?: {
    status?: string;
    cufe?: string;
    cude?: string;
    identifier?: string;
    observations?: string[];
  };
  /** Errores de validación cuando Siigo rechaza. */
  errors?: Array<{ Code?: string; Message?: string; Status?: number; Params?: unknown }>;
  /** PDF/XML/QR adicionales devueltos por Siigo. */
  metadata?: { created?: string; last_updated?: string };
  pdf_url?: string;
  xml_url?: string;
  qr_url?: string;
  additional_fields?: {
    pdf_url?: string;
    xml_url?: string;
    qr_url?: string;
    [k: string]: unknown;
  };
}

/** Snapshot reducido de `mapStampStatus` (poll-mapper.ts). */
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

/** Resultado uniforme de `siigoFetch`. */
export interface SiigoFetchResult<T = unknown> {
  ok: boolean;
  status: number;
  body: T;
  latencyMs: number;
}

/** Datos mínimos del customer que `ensureSiigoCustomer` necesita. */
export interface CustomerForSiigo {
  id: string;
  doc_type: 'cedula' | 'nit' | 'pasaporte';
  doc_number: string;
  dv: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  municipio: string | null;
  departamento: string | null;
  responsabilidades_fiscales: string[] | null;
  siigo_customer_id: string | null;
}
