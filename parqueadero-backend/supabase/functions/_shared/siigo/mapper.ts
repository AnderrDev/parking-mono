// Mapper de InvoiceRow + customer + payment + items → payload de POST /v1/invoices.
// Spec: specs/edge-functions/_shared-siigo-client.spec.md §"mapper.ts"

import type { SiigoInvoicePayload, SiigoInvoiceItem, SiigoInvoicePayment } from './types.ts';

export type LocalPaymentMethod =
  | 'efectivo'
  | 'tarjeta_credito'
  | 'tarjeta_debito'
  | 'transferencia'
  | 'nequi'
  | 'daviplata'
  | 'cortesia'
  | 'error'
  | 'mensual';

/** Datos mínimos de la invoice (proyección de columnas) que el mapper necesita. */
export interface InvoiceForMapper {
  id: string;
  internal_number: string;
  total_cents: number;
  subtotal_cents: number;
  tax_cents: number;
  issued_at: string;
  notes: string | null;
}

/** Datos mínimos del payment. */
export interface PaymentForMapper {
  id: string;
  method: LocalPaymentMethod;
  amount_cents: number;
}

/** Datos mínimos del customer (ya con `siigo_customer_id` resuelto). */
export interface CustomerForMapper {
  doc_number: string;
  email: string | null;
}

/** Item lógico previo al mapping (lo arma el caller — la EF S4). */
export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
  /** SIIGO_PRODUCT_ID_PARKING_HOUR | SIIGO_PRODUCT_ID_MONTHLY_PLAN | otro pre-cargado en Siigo. */
  productCode: string;
}

/** Construye el JSON exacto que espera POST https://api.siigo.com/v1/invoices. */
export function toSiigoInvoicePayload(
  invoice: InvoiceForMapper,
  customer: CustomerForMapper,
  payment: PaymentForMapper,
  items: InvoiceItemInput[],
): SiigoInvoicePayload {
  const documentTypeId = readIntEnv('SIIGO_DOCUMENT_TYPE_ID');
  const sellerId = readIntEnv('SIIGO_SELLER_ID');
  const taxId = readIntEnv('SIIGO_TAX_IVA_ID');

  const date = invoice.issued_at.slice(0, 10);

  const siigoItems: SiigoInvoiceItem[] = items.map((it) => ({
    code: it.productCode,
    description: it.description,
    quantity: it.quantity,
    price: centsToPesos(it.unitPriceCents),
    discount: 0,
    taxes: [{ id: taxId }],
  }));

  const siigoPayments: SiigoInvoicePayment[] = [{
    id: mapPaymentMethod(payment.method),
    value: centsToPesos(invoice.total_cents),
    due_date: date,
  }];

  return {
    document: { id: documentTypeId },
    date,
    customer: { identification: customer.doc_number, branch_office: 0 },
    currency: { code: 'COP', exchange_rate: 1 },
    seller: sellerId,
    observations: invoice.notes ?? '',
    items: siigoItems,
    payments: siigoPayments,
    stamp: { send: true },
    mail: { send: !!customer.email },
  };
}

/** PaymentMethod local → id Siigo (config en env). */
export function mapPaymentMethod(method: LocalPaymentMethod): number {
  switch (method) {
    case 'efectivo':
    case 'cortesia':
      return readIntEnv('SIIGO_PAYMENT_CASH_ID');
    case 'tarjeta_credito':
      return readIntEnv('SIIGO_PAYMENT_CARD_CREDIT_ID');
    case 'tarjeta_debito':
      return readIntEnv('SIIGO_PAYMENT_CARD_DEBIT_ID');
    case 'transferencia':
      return readIntEnv('SIIGO_PAYMENT_TRANSFER_ID');
    case 'nequi':
      return readIntEnv('SIIGO_PAYMENT_NEQUI_ID');
    case 'daviplata':
      return readIntEnv('SIIGO_PAYMENT_DAVIPLATA_ID');
    case 'error':
      throw new Error('No se emite FE para pagos marcados como "error de entrada"');
    case 'mensual':
      throw new Error('No se emite FE para salidas con pago mensual (regla Fase 11)');
  }
}

/** Helper: descripción legible para item de parqueo. */
export function buildParkingItemDescription(plate: string, entryAt: string, exitAt: string): string {
  return `Parqueo ${plate} ${formatTime(entryAt)} → ${formatTime(exitAt)}`;
}

function formatTime(iso: string): string {
  // 2026-05-02T13:00:00Z → 2026-05-02 13:00
  return iso.slice(0, 16).replace('T', ' ');
}

function centsToPesos(cents: number): number {
  return Math.round(cents) / 100;
}

function readIntEnv(name: string): number {
  const raw = Deno.env.get(name);
  if (!raw) throw new Error(`Env var ${name} no configurada (Siigo)`);
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`Env var ${name}=${raw} no es un entero`);
  }
  return n;
}
