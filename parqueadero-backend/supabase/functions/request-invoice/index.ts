// DEPRECATED — Esta Edge Function se elimina en Fase 11 / S9 (cutover Siigo).
// El frontend ya invoca `siigo-emit-invoice` directamente. Se preserva
// únicamente para compatibilidad con clientes legacy y se apaga en S9.
//
// IMPORTANTE: el cómputo de IVA se alineó con el helper compartido
// `_shared/tax/extract.ts` (régimen común, IVA INCLUIDO en precio) — antes
// sumaba IVA encima, lo cual inflaba totales y contradecía
// `specs/tax-config.spec.md` y la migración 00016.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getTaxConfig, extractInvoiceAmounts } from '../_shared/tax/extract.ts';

const DIAN_TIMEOUT_MS = 28_000;

interface RequestBody {
  session_id: string;
  customer_id: string;
  notes?: string | null;
  reissue?: boolean;
  invoice_id?: string | null;
}

interface DianServiceResponse {
  success: boolean;
  invoice_number: string;
  cufe: string;
  dian_status: 'accepted' | 'rejected' | 'contingency';
  dian_messages?: string[];
  xml_url: string | null;
  pdf_url: string | null;
  issued_at: string;
}

function buildInvoiceNumber(seq: number): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `FAC-${y}-${m}-${day}-${String(seq).padStart(6, '0')}`;
}

function stub(invoiceNumber: string): DianServiceResponse {
  return {
    success: true,
    invoice_number: invoiceNumber,
    cufe: `STUB-${crypto.randomUUID()}`,
    dian_status: 'accepted',
    dian_messages: [],
    xml_url: null,
    pdf_url: null,
    issued_at: new Date().toISOString(),
  };
}

// Fase 11 / S2: el trigger sync_dian_from_siigo deriva dian_status desde siigo_status.
// Esta EF legacy mapea su dian_status (proveniente del stub o dian-fe-service) al
// equivalente Siigo para que el trigger no sobreescriba con un valor incorrecto.
// Se elimina en S9 cuando esta EF se apague.
function dianToSiigoStatus(s: 'accepted' | 'rejected' | 'contingency'): string {
  if (s === 'accepted')    return 'Stamped';
  if (s === 'rejected')    return 'Rejected';
  return 'queued_offline';   // contingency
}

async function callDianService(
  url: string,
  payload: Record<string, unknown>,
): Promise<DianServiceResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DIAN_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, invoice_number: '', cufe: '', dian_status: 'rejected', dian_messages: [err?.detail ?? 'Error DIAN'], xml_url: null, pdf_url: null, issued_at: new Date().toISOString() };
    }
    return res.json() as Promise<DianServiceResponse>;
  } catch {
    clearTimeout(timer);
    return { success: false, invoice_number: '', cufe: '', dian_status: 'contingency', dian_messages: ['Timeout o error de red con DIAN'], xml_url: null, pdf_url: null, issued_at: new Date().toISOString() };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

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
  if (authErr || !user) return new Response('Unauthorized', { status: 401 });

  const body: RequestBody = await req.json();
  const { session_id, customer_id, notes, reissue, invoice_id } = body;

  // ── Reissue path ──────────────────────────────────────────────
  if (reissue && invoice_id) {
    const { data: existing, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single<Record<string, unknown>>();

    if (invErr || !existing) {
      return new Response(JSON.stringify({ error: 'Factura no encontrada' }), { status: 404 });
    }
    if (existing['dian_status'] === 'accepted') {
      return new Response(JSON.stringify({ error: 'La factura ya está aceptada por DIAN' }), { status: 409 });
    }

    const dianUrl = Deno.env.get('DIAN_FE_SERVICE_URL') ?? '';
    const dianResponse = dianUrl
      ? await callDianService(dianUrl, { invoice_id, reissue: true })
      : stub(existing['internal_number'] as string);

    const { data: updated } = await supabase
      .from('invoices')
      .update({
        siigo_status: dianToSiigoStatus(dianResponse.dian_status),
        siigo_cufe: dianResponse.cufe || existing['siigo_cufe'],
        siigo_pdf_url: dianResponse.pdf_url,
        siigo_xml_url: dianResponse.xml_url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoice_id)
      .select()
      .single<Record<string, unknown>>();

    return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
  }

  // ── New invoice path ──────────────────────────────────────────
  // 1. Load session + payment
  const { data: session, error: sessErr } = await supabase
    .from('parking_sessions')
    .select('id, status, vehicle_plate, cashier_shift_id')
    .eq('id', session_id)
    .single<Record<string, unknown>>();

  if (sessErr || !session) {
    return new Response(JSON.stringify({ error: 'Sesión no encontrada' }), { status: 404 });
  }
  if (session['status'] !== 'completed') {
    return new Response(JSON.stringify({ error: 'La sesión debe estar completada' }), { status: 422 });
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('id, amount_cents, invoice_id')
    .eq('session_id', session_id)
    .eq('status', 'completed')
    .maybeSingle<Record<string, unknown>>();

  if (payment?.['invoice_id']) {
    // Check if that invoice is accepted
    const { data: prevInv } = await supabase
      .from('invoices')
      .select('dian_status')
      .eq('id', payment['invoice_id'])
      .maybeSingle<{ dian_status: string }>();
    if (prevInv?.dian_status === 'accepted') {
      return new Response(JSON.stringify({ error: 'Ya existe una factura aceptada para esta sesión' }), { status: 409 });
    }
  }

  // 2. Load customer
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id, name, doc_type, doc_number, email')
    .eq('id', customer_id)
    .single<Record<string, unknown>>();

  if (custErr || !customer) {
    return new Response(JSON.stringify({ error: 'Cliente no encontrado' }), { status: 404 });
  }
  if (!customer['doc_number'] || !customer['name']) {
    return new Response(JSON.stringify({ error: 'El cliente no tiene datos fiscales completos' }), { status: 422 });
  }

  // 3. Assign invoice number
  const { data: seqData, error: seqErr } = await supabase.rpc('nextval_invoices');
  if (seqErr || !seqData) {
    return new Response(JSON.stringify({ error: 'Error generando número de factura' }), { status: 500 });
  }
  const invoiceNumber = buildInvoiceNumber(Number(seqData));

  // 4. Calculate amounts — extraer base + IVA del total cobrado.
  // NO sumar IVA encima: el precio cobrado en caja YA incluye IVA (régimen común).
  const amountCents = Number(payment?.['amount_cents'] ?? 0);
  const taxConfig = await getTaxConfig(supabase);
  const amounts = extractInvoiceAmounts(amountCents, taxConfig);
  const subtotalCents = amounts.base_cents;
  const taxCents = amounts.iva_cents;
  const totalCents = amounts.total_cents;

  // 5. Call DIAN service or stub
  const dianUrl = Deno.env.get('DIAN_FE_SERVICE_URL') ?? '';
  const dianPayload = {
    customer_name: customer['name'],
    customer_doc_type: customer['doc_type'],
    customer_doc_number: customer['doc_number'],
    customer_email: customer['email'],
    invoice_type: '01',
    invoice_date: new Date().toISOString(),
    subtotal_cents: subtotalCents,
    tax_cents: taxCents,
    total_cents: totalCents,
    internal_number: invoiceNumber,
    parking_session_ids: [session_id],
  };

  const dianResponse = dianUrl
    ? await callDianService(dianUrl, dianPayload)
    : stub(invoiceNumber);

  // 6. Persist invoice
  const { data: invoice, error: insertErr } = await supabase
    .from('invoices')
    .insert({
      internal_number: invoiceNumber,
      customer_id,
      session_id,
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      total_cents: totalCents,
      siigo_status: dianToSiigoStatus(dianResponse.dian_status),
      siigo_cufe: dianResponse.cufe || null,
      siigo_xml_url: dianResponse.xml_url,
      siigo_pdf_url: dianResponse.pdf_url,
      requested_invoice: true,
      issued_at: dianResponse.issued_at,
      ...(notes ? { notes } : {}),
      ...(payment?.['id'] ? { payment_id: payment['id'] } : {}),
    })
    .select()
    .single<Record<string, unknown>>();

  if (insertErr || !invoice) {
    return new Response(JSON.stringify({ error: insertErr?.message ?? 'Error guardando factura' }), { status: 500 });
  }

  // 7. Link invoice to payment
  if (payment?.['id']) {
    await supabase
      .from('payments')
      .update({ invoice_id: invoice['id'] })
      .eq('id', payment['id']);
  }

  return new Response(JSON.stringify(invoice), {
    headers: { 'Content-Type': 'application/json' },
    status: 201,
  });
});
