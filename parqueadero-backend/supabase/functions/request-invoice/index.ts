// request-invoice — asigna número interno (ticket POS) y persiste la factura
// interna ligada a una parking_session completada.
//
// NO emite factura electrónica DIAN — el alcance del proyecto descartó FE/Siigo
// el 2026-05-20. El cómputo de IVA usa el helper `_shared/tax/extract.ts`
// (régimen común, IVA incluido en el precio cobrado).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getTaxConfig, extractInvoiceAmounts } from '../_shared/tax/extract.ts';

interface RequestBody {
  session_id: string;
  customer_id: string;
  notes?: string | null;
}

function buildInvoiceNumber(seq: number): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `FAC-${y}-${m}-${day}-${String(seq).padStart(6, '0')}`;
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
  const { session_id, customer_id, notes } = body;

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
    return new Response(JSON.stringify({ error: 'Ya existe un ticket para esta sesión' }), { status: 409 });
  }

  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id, name, doc_type, doc_number, email')
    .eq('id', customer_id)
    .single<Record<string, unknown>>();

  if (custErr || !customer) {
    return new Response(JSON.stringify({ error: 'Cliente no encontrado' }), { status: 404 });
  }

  const { data: seqData, error: seqErr } = await supabase.rpc('nextval_invoices');
  if (seqErr || !seqData) {
    return new Response(JSON.stringify({ error: 'Error generando número de ticket' }), { status: 500 });
  }
  const internalNumber = buildInvoiceNumber(Number(seqData));

  const amountCents = Number(payment?.['amount_cents'] ?? 0);
  const taxConfig = await getTaxConfig(supabase);
  const amounts = extractInvoiceAmounts(amountCents, taxConfig);

  const { data: invoice, error: insertErr } = await supabase
    .from('invoices')
    .insert({
      internal_number: internalNumber,
      customer_id,
      session_id,
      subtotal_cents: amounts.base_cents,
      tax_cents: amounts.iva_cents,
      total_cents: amounts.total_cents,
      requested_invoice: true,
      issued_at: new Date().toISOString(),
      ...(notes ? { notes } : {}),
      ...(payment?.['id'] ? { payment_id: payment['id'] } : {}),
    })
    .select()
    .single<Record<string, unknown>>();

  if (insertErr || !invoice) {
    return new Response(JSON.stringify({ error: insertErr?.message ?? 'Error guardando ticket' }), { status: 500 });
  }

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
