// Asegura que un customer local exista como tercero en Siigo.
// Spec: specs/edge-functions/_shared-siigo-client.spec.md §"customer.ts"

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  CustomerForSiigo,
  SiigoCustomerCreatePayload,
  SiigoCustomerListResponse,
  SiigoCustomerResponse,
} from './types.ts';
import { SiigoCustomerError } from './errors.ts';
import { siigoFetch } from './client.ts';

export interface EnsureSiigoCustomerResult {
  siigoCustomerId: string;
  /** TRUE si se creó o se enlazó por primera vez en esta llamada. */
  created: boolean;
}

/** Devuelve el `siigo_customer_id` para un customer local. Crea o reusa según haga falta. */
export async function ensureSiigoCustomer(
  serviceClient: SupabaseClient,
  token: string,
  baseUrl: string,
  customer: CustomerForSiigo,
  invoiceId: string | null = null,
): Promise<EnsureSiigoCustomerResult> {
  if (customer.siigo_customer_id) {
    return { siigoCustomerId: customer.siigo_customer_id, created: false };
  }

  const payload = buildCreatePayload(customer);

  // 1) POST /v1/customers — caso feliz: 201 con id.
  const create = await siigoFetch<SiigoCustomerResponse | { Errors?: unknown[]; errors?: unknown[] }>(
    serviceClient,
    { invoiceId, operation: 'customer_upsert', attemptNumber: 1 },
    token,
    baseUrl,
    '/v1/customers',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );

  if (create.ok && create.body && typeof create.body === 'object' && 'id' in (create.body as object)) {
    const created = (create.body as SiigoCustomerResponse).id;
    await persistSiigoId(serviceClient, customer.id, created, null);
    return { siigoCustomerId: created, created: true };
  }

  // 2) Conflict: el documento ya existe en Siigo (otro tenant del mismo NIT
  //    o una creación previa que falló al persistirse). Buscamos por documento.
  if (create.status === 409) {
    const existing = await findByIdentification(serviceClient, token, baseUrl, customer.doc_number, invoiceId);
    if (existing) {
      await persistSiigoId(serviceClient, customer.id, existing, null);
      return { siigoCustomerId: existing, created: true };
    }
    // Siigo dijo conflict pero no encontramos por doc → algo raro, fallar duro.
    await persistSiigoId(serviceClient, customer.id, null, 'Siigo respondió 409 pero GET por documento no devolvió match');
    throw new SiigoCustomerError('Siigo respondió 409 sin match por documento', create.body);
  }

  // 3) Validación u otro error — persistir el error para troubleshooting y propagar.
  const errorMsg = pickErrorMessage(create.body, create.status);
  await persistSiigoId(serviceClient, customer.id, null, errorMsg);
  throw new SiigoCustomerError(errorMsg, create.body);
}

function buildCreatePayload(c: CustomerForSiigo): SiigoCustomerCreatePayload {
  const isCompany = c.doc_type === 'nit';
  const docCode = mapDocType(c.doc_type);
  const names = isCompany ? [c.name] : splitNames(c.name);
  const fiscal = mapFiscalResponsibilities(c.responsabilidades_fiscales);

  const payload: SiigoCustomerCreatePayload = {
    person_type: isCompany ? 'Company' : 'Person',
    id_type: { code: docCode },
    identification: c.doc_number,
    check_digit: c.dv ?? null,
    name: names,
    commercial_name: c.name,
    branch_office: 0,
    active: true,
    vat_responsible: fiscal.some((f) => f.code === 'O-13' || f.code === 'O-15'),
    fiscal_responsibilities: fiscal,
  };

  if (c.address && c.municipio && c.departamento) {
    payload.address = {
      address: c.address,
      city: { country_code: 'Co', state_code: c.departamento, city_code: c.municipio },
    };
  }
  if (c.phone) {
    payload.phones = [{ indicative: '57', number: c.phone }];
  }
  if (c.email) {
    const [first, ...rest] = c.name.split(' ');
    payload.contacts = [{
      first_name: first || c.name,
      last_name: rest.join(' ') || c.name,
      email: c.email,
    }];
  }

  return payload;
}

async function findByIdentification(
  serviceClient: SupabaseClient,
  token: string,
  baseUrl: string,
  docNumber: string,
  invoiceId: string | null,
): Promise<string | null> {
  const lookup = await siigoFetch<SiigoCustomerListResponse>(
    serviceClient,
    { invoiceId, operation: 'customer_upsert', attemptNumber: 2 },
    token,
    baseUrl,
    `/v1/customers?identification=${encodeURIComponent(docNumber)}`,
    { method: 'GET' },
  );

  if (!lookup.ok || !lookup.body || !Array.isArray(lookup.body.results)) return null;
  return lookup.body.results[0]?.id ?? null;
}

async function persistSiigoId(
  serviceClient: SupabaseClient,
  customerId: string,
  siigoCustomerId: string | null,
  syncError: string | null,
): Promise<void> {
  const update: Record<string, unknown> = {
    siigo_synced_at: new Date().toISOString(),
    siigo_sync_error: syncError,
  };
  if (siigoCustomerId) update.siigo_customer_id = siigoCustomerId;

  const { error } = await serviceClient
    .from('customers')
    .update(update)
    .eq('id', customerId);

  if (error) {
    console.error('[siigo:customer] fallo persistiendo siigo_customer_id:', error.message);
  }
}

function pickErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    const errs = (obj.Errors ?? obj.errors) as unknown[] | undefined;
    if (Array.isArray(errs) && errs.length > 0) {
      const first = errs[0] as Record<string, unknown>;
      const msg = first.Message ?? first.message ?? first.detail;
      if (typeof msg === 'string') return msg;
    }
    if (typeof obj.message === 'string') return obj.message;
  }
  return `HTTP ${status}`;
}

// ─── Helpers expuestos para tests/mappers ────────────────────────────────────

/** doc_type local → código DIAN/Siigo. */
export function mapDocType(t: 'cedula' | 'nit' | 'pasaporte'): number {
  switch (t) {
    case 'cedula':    return 13; // CC
    case 'nit':       return 31; // NIT
    case 'pasaporte': return 41; // PA
  }
}

/** Si el name tiene al menos un espacio, se parte; si no, se duplica para
 *  cumplir con el formato Person de Siigo (firstName, lastName). */
export function splitNames(fullName: string): [string, string] {
  const trimmed = fullName.trim();
  const idx = trimmed.indexOf(' ');
  if (idx === -1) return [trimmed, trimmed];
  return [trimmed.slice(0, idx), trimmed.slice(idx + 1).trim()];
}

/** Pass-through de códigos DIAN reconocibles; cualquier valor extraño se descarta. */
export function mapFiscalResponsibilities(arr: string[] | null): { code: string }[] {
  if (!arr || arr.length === 0) return [{ code: 'R-99-PN' }]; // No responsable IVA, persona natural
  const known = new Set(['O-13', 'O-15', 'O-23', 'O-47', 'R-99-PN']);
  return arr.filter((c) => known.has(c)).map((code) => ({ code }));
}
