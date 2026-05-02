// Edge Function: siigo-emit-invoice
// Spec: ../../specs/edge-functions/siigo-emit-invoice.spec.md
//
// Flujo asíncrono — esta EF retorna apenas Siigo confirma recepción.
// El cron `siigo-poll-status` (S5) lleva los `pending`/`InProcess`/`Sent`
// hasta `Stamped`/`Rejected`.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSiigoToken } from '../_shared/siigo/auth.ts';
import { siigoFetch } from '../_shared/siigo/client.ts';
import { ensureSiigoCustomer } from '../_shared/siigo/customer.ts';
import {
  buildParkingItemDescription,
  toSiigoInvoicePayload,
  type LocalPaymentMethod,
  type CustomerForMapper,
  type InvoiceItemInput,
  type InvoiceForMapper,
  type PaymentForMapper,
} from '../_shared/siigo/mapper.ts';
import { mapStampStatus } from '../_shared/siigo/poll-mapper.ts';
import type { SiigoInvoiceResponse, SiigoStatusInternal, CustomerForSiigo } from '../_shared/siigo/types.ts';
import { SiigoAuthError, SiigoCustomerError } from '../_shared/siigo/errors.ts';

interface RequestBody {
  session_id: string;
  customer_id: string;
  notes?: string | null;
}

const TAX_PERCENT = Number(Deno.env.get('SIIGO_TAX_IVA_PERCENT') ?? '19');
const SIIGO_BASE_URL = (Deno.env.get('SIIGO_BASE_URL') ?? 'https://api.siigo.com').replace(/\/$/, '');

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // ─── Auth ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const role = (user.app_metadata as { role?: string } | null)?.role
    ?? (user.user_metadata as { role?: string } | null)?.role;
  if (role && role !== 'admin' && role !== 'operador') {
    return jsonResponse({ error: 'Forbidden — rol no autorizado para emitir FE' }, 403);
  }

  // ─── Body ──────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400);
  }
  const { session_id, customer_id, notes } = body;
  if (!session_id || !customer_id) {
    return jsonResponse({ error: 'session_id y customer_id son requeridos' }, 400);
  }

  // ─── Cargar sesión ────────────────────────────────────────────────
  const { data: session, error: sessErr } = await supabase
    .from('parking_sessions')
    .select('id, status, vehicle_plate, entry_at, exit_at, monthly_plan_id')
    .eq('id', session_id)
    .single();
  if (sessErr || !session) return jsonResponse({ error: 'Sesión no encontrada' }, 404);
  if (session.status !== 'completed') {
    return jsonResponse({ error: 'La sesión debe estar completada' }, 422);
  }

  // ─── Cargar payment ───────────────────────────────────────────────
  const { data: payment } = await supabase
    .from('payments')
    .select('id, method, amount_cents, invoice_id, status')
    .eq('session_id', session_id)
    .eq('status', 'completed')
    .maybeSingle();
  if (!payment) {
    return jsonResponse({ error: 'No hay pago completado asociado a la sesión' }, 422);
  }

  // ─── Bloqueo plan mensual (regla Fase 11) ─────────────────────────
  if (payment.method === 'mensual' || session.monthly_plan_id) {
    return jsonResponse({
      error: 'No se emite factura electrónica para salidas con plan mensual',
      details: 'La facturación de mensualidades se gestiona por separado',
    }, 409);
  }
  if (payment.method === 'error') {
    return jsonResponse({
      error: 'No se emite factura electrónica para pagos marcados como "error de entrada"',
    }, 409);
  }

  // ─── Idempotencia por session_id ──────────────────────────────────
  const { data: existing } = await supabase
    .from('invoices')
    .select('*')
    .eq('session_id', session_id)
    .in('siigo_status', ['pending', 'InProcess', 'Sent', 'Stamped'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return jsonResponse(existing, 200);
  }

  // ─── Cargar customer + validar datos fiscales ─────────────────────
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id, doc_type, doc_number, dv, name, email, phone, address, municipio, departamento, responsabilidades_fiscales, siigo_customer_id')
    .eq('id', customer_id)
    .single();
  if (custErr || !customer) return jsonResponse({ error: 'Cliente no encontrado' }, 404);

  const missing = ['doc_type', 'doc_number', 'name', 'email']
    .filter((k) => !(customer as Record<string, unknown>)[k]);
  if (missing.length > 0) {
    return jsonResponse({
      error: 'Datos fiscales del cliente incompletos',
      details: `Faltan: ${missing.join(', ')}`,
    }, 422);
  }

  // ─── Token Siigo ──────────────────────────────────────────────────
  let token: string;
  try {
    token = await getSiigoToken(supabase);
  } catch (err) {
    if (err instanceof SiigoAuthError) {
      return jsonResponse({ error: 'Siigo Auth no disponible', details: err.message }, 503);
    }
    throw err;
  }

  // ─── Customer en Siigo (auto-create on-demand) ────────────────────
  let siigoCustomerId: string;
  try {
    const result = await ensureSiigoCustomer(
      supabase,
      token,
      SIIGO_BASE_URL,
      customer as CustomerForSiigo,
    );
    siigoCustomerId = result.siigoCustomerId;
  } catch (err) {
    if (err instanceof SiigoCustomerError) {
      return jsonResponse({
        error: 'Siigo rechazó el alta del cliente',
        details: err.message,
      }, 422);
    }
    throw err;
  }

  // ─── Numeración interna + INSERT pending ──────────────────────────
  const internalNumber = await buildInternalNumber(supabase);
  if (!internalNumber) {
    return jsonResponse({ error: 'Error generando número interno' }, 500);
  }

  const subtotalCents = Number(payment.amount_cents);
  const taxCents = Math.round(subtotalCents * (TAX_PERCENT / 100));
  const totalCents = subtotalCents + taxCents;
  const issuedAt = new Date().toISOString();

  const { data: inserted, error: insertErr } = await supabase
    .from('invoices')
    .insert({
      internal_number: internalNumber,
      customer_id,
      session_id,
      payment_id: payment.id,
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      total_cents: totalCents,
      siigo_status: 'pending',
      requested_invoice: true,
      issued_at: issuedAt,
      ...(notes ? { notes } : {}),
    })
    .select()
    .single();
  if (insertErr || !inserted) {
    return jsonResponse({
      error: 'Error guardando factura',
      details: insertErr?.message ?? null,
    }, 500);
  }
  const invoiceId = inserted.id as string;

  // ─── Llamar Siigo POST /v1/invoices ───────────────────────────────
  const item: InvoiceItemInput = {
    description: buildParkingItemDescription(
      session.vehicle_plate,
      session.entry_at,
      session.exit_at ?? issuedAt,
    ),
    quantity: 1,
    unitPriceCents: subtotalCents,
    productCode: Deno.env.get('SIIGO_PRODUCT_ID_PARKING_HOUR') ?? '',
  };

  const invoicePayload = toSiigoInvoicePayload(
    {
      id: invoiceId,
      internal_number: internalNumber,
      total_cents: totalCents,
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      issued_at: issuedAt,
      notes: notes ?? null,
    } satisfies InvoiceForMapper,
    {
      doc_number: customer.doc_number,
      email: customer.email,
    } satisfies CustomerForMapper,
    {
      id: payment.id,
      method: payment.method as LocalPaymentMethod,
      amount_cents: subtotalCents,
    } satisfies PaymentForMapper,
    [item],
  );
  // El payload usa `customer.identification` desde doc_number; el id de Siigo
  // (siigoCustomerId) ya quedó persistido en customers.
  void siigoCustomerId;

  let siigoStatus: SiigoStatusInternal = 'pending';
  let updatePatch: Record<string, unknown> = {};
  let lastError: string | null = null;

  try {
    const res = await siigoFetch<SiigoInvoiceResponse>(
      supabase,
      { invoiceId, operation: 'emit', attemptNumber: 1 },
      token,
      SIIGO_BASE_URL,
      '/v1/invoices',
      { method: 'POST', body: JSON.stringify(invoicePayload) },
    );

    if (res.ok && res.body) {
      const stamp = mapStampStatus(res.body);
      siigoStatus = stamp.status;
      updatePatch = {
        siigo_status: stamp.status,
        siigo_id: res.body.id ?? null,
        siigo_number: stamp.number,
        siigo_cufe: stamp.cufe,
        siigo_cude: stamp.cude,
        siigo_pdf_url: stamp.pdfUrl,
        siigo_xml_url: stamp.xmlUrl,
        siigo_qr_url: stamp.qrUrl,
        siigo_observations: stamp.observations.length > 0 ? stamp.observations : null,
        siigo_attempts: 1,
        siigo_last_attempt_at: new Date().toISOString(),
      };
    } else if (res.status >= 400 && res.status < 500) {
      // Validación: factura rechazada de entrada. Persistimos el motivo.
      siigoStatus = 'Rejected';
      lastError = pickErrorFromBody(res.body) ?? `HTTP ${res.status}`;
      updatePatch = {
        siigo_status: 'Rejected',
        siigo_attempts: 1,
        siigo_last_attempt_at: new Date().toISOString(),
        siigo_last_error: lastError,
      };
    } else {
      // 5xx u otra cosa rara — dejamos pending para que el cron reintente.
      siigoStatus = 'pending';
      lastError = `HTTP ${res.status}`;
      updatePatch = {
        siigo_attempts: 1,
        siigo_last_attempt_at: new Date().toISOString(),
        siigo_last_error: lastError,
      };
    }
  } catch (err) {
    // Network / timeout — invoice queda pending; el cron reintenta.
    siigoStatus = 'pending';
    lastError = err instanceof Error ? err.message : String(err);
    updatePatch = {
      siigo_attempts: 1,
      siigo_last_attempt_at: new Date().toISOString(),
      siigo_last_error: lastError,
    };
  }

  // ─── UPDATE invoice + vincular payment ────────────────────────────
  const { data: finalInvoice, error: updErr } = await supabase
    .from('invoices')
    .update(updatePatch)
    .eq('id', invoiceId)
    .select()
    .single();

  if (updErr || !finalInvoice) {
    // El INSERT inicial sí se persistió; un fallo aquí solo significa que
    // el estado quedó como pending. El cron lo recogerá si hay siigo_id;
    // si no, el operador puede invocar la EF de nuevo y la idempotencia
    // por session_id devolverá la fila parcialmente actualizada.
    return jsonResponse({
      error: 'Factura emitida pero no se pudo actualizar estado',
      details: updErr?.message ?? null,
      invoice_id: invoiceId,
    }, 500);
  }

  // Vincular payment.invoice_id (no fatal si falla)
  await supabase
    .from('payments')
    .update({ invoice_id: invoiceId })
    .eq('id', payment.id);

  void siigoStatus; // ya está dentro de finalInvoice.siigo_status
  return jsonResponse(finalInvoice, 201);
});

// ─────────────────────────────────────────────────────────────────────
// Helpers locales
// ─────────────────────────────────────────────────────────────────────

async function buildInternalNumber(supabase: SupabaseClient): Promise<string | null> {
  const { data: seq, error } = await supabase.rpc('nextval_invoices');
  if (error || seq == null) return null;
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `FAC-${y}-${m}-${day}-${String(seq).padStart(6, '0')}`;
}

function pickErrorFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;
  const errs = (obj.Errors ?? obj.errors) as unknown[] | undefined;
  if (Array.isArray(errs) && errs.length > 0) {
    const first = errs[0] as Record<string, unknown>;
    const msg = first.Message ?? first.message ?? first.detail;
    if (typeof msg === 'string') return msg;
  }
  if (typeof obj.message === 'string') return obj.message;
  return null;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}
