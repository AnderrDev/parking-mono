// Mapper del response de GET /v1/invoices/{id} → snapshot interno SiigoStampInfo.
// Spec: specs/edge-functions/_shared-siigo-client.spec.md §"poll-mapper.ts"

import type { SiigoInvoiceResponse, SiigoStampInfo, SiigoStatusInternal } from './types.ts';

const KNOWN_STAMP_STATUS: Record<string, SiigoStatusInternal> = {
  'Stamped':   'Stamped',
  'Rejected':  'Rejected',
  'Sent':      'Sent',
  'InProcess': 'InProcess',
  'Pending':   'pending',
};

/** Normaliza el response Siigo. Tolerante a campos faltantes y variaciones del API. */
export function mapStampStatus(response: SiigoInvoiceResponse): SiigoStampInfo {
  const stamp = response.stamp ?? {};
  const additional = response.additional_fields ?? {};

  const rawStatus = (stamp.status ?? '').trim();
  const status: SiigoStatusInternal = KNOWN_STAMP_STATUS[rawStatus] ?? 'pending';

  const cufe = stamp.cufe ?? null;
  const cude = stamp.cude ?? null;

  const observations = Array.isArray(stamp.observations)
    ? stamp.observations.filter((o): o is string => typeof o === 'string')
    : [];

  // Si Siigo devolvió un array `errors`, lo concatenamos a observations
  // (útil para Rejected — el motivo va ahí).
  if (status === 'Rejected' && Array.isArray(response.errors)) {
    for (const e of response.errors) {
      const msg = (e?.Message ?? '') as string;
      if (typeof msg === 'string' && msg.length > 0) observations.push(msg);
    }
  }

  return {
    status,
    cufe,
    cude,
    number: response.name ?? (response.number != null ? String(response.number) : null),
    pdfUrl: response.pdf_url ?? additional.pdf_url ?? null,
    xmlUrl: response.xml_url ?? additional.xml_url ?? null,
    qrUrl: response.qr_url ?? additional.qr_url ?? null,
    observations,
  };
}
