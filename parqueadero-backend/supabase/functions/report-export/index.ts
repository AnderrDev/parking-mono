import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPIRES_MINUTES = 15;
const FREE_METHODS = ['cortesia', 'error', 'mensual'];

interface RequestBody {
  entity: 'payments' | 'sessions';
  date_from: string;
  date_to: string;
  operator_id?: string | null;
}

function csvRow(values: (string | number | null | undefined)[]): string {
  return values
    .map((v) => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    })
    .join(',');
}

function formatCOP(cents: number): string {
  return (cents / 100).toFixed(0);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // Verify JWT and role
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>();

  if (!userData || !['admin', 'contador', 'operador'].includes(userData.role)) {
    return new Response('Forbidden', { status: 403 });
  }

  const body: RequestBody = await req.json();
  const { entity, date_from, date_to, operator_id } = body;

  let csvContent = '﻿'; // UTF-8 BOM para compatibilidad Excel Colombia

  if (entity === 'payments') {
    let query = supabase
      .from('v_revenue_daily')
      .select('*')
      .gte('paid_at', date_from)
      .lte('paid_at', date_to)
      .order('paid_at', { ascending: true });

    if (operator_id) query = query.eq('operator_id', operator_id);

    const { data: rows, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    csvContent += csvRow(['paid_at', 'method', 'amount_cop', 'is_revenue', 'operator', 'vehicle_type']) + '\n';
    for (const row of rows ?? []) {
      csvContent += csvRow([
        row.paid_at,
        row.method,
        formatCOP(row.amount_cents),
        FREE_METHODS.includes(row.method) ? '0' : '1',
        row.operator_name,
        row.vehicle_type ?? '',
      ]) + '\n';
    }
  } else {
    let query = supabase
      .from('v_sessions_by_type')
      .select('*')
      .gte('entry_at', date_from)
      .lte('entry_at', date_to)
      .order('entry_at', { ascending: true });

    if (operator_id) query = query.eq('operator_id', operator_id);

    const { data: rows, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    csvContent += csvRow(['entry_at', 'exit_at', 'vehicle_type', 'duration_min', 'amount_cop', 'operator']) + '\n';
    for (const row of rows ?? []) {
      csvContent += csvRow([
        row.entry_at,
        row.exit_at ?? '',
        row.vehicle_type,
        row.duration_minutes != null ? Math.round(row.duration_minutes) : '',
        formatCOP(row.amount_cents),
        row.operator_name,
      ]) + '\n';
    }
  }

  // Upload to Storage
  const fileName = `exports/export-${entity}-${date_from.slice(0, 10)}-${date_to.slice(0, 10)}-${Date.now()}.csv`;
  const { error: uploadError } = await supabase.storage
    .from('reports')
    .upload(fileName, new TextEncoder().encode(csvContent), {
      contentType: 'text/csv; charset=utf-8',
      upsert: false,
    });

  if (uploadError) {
    return new Response(JSON.stringify({ error: uploadError.message }), { status: 500 });
  }

  // Signed URL (15 min)
  const { data: signedData, error: signedError } = await supabase.storage
    .from('reports')
    .createSignedUrl(fileName, EXPIRES_MINUTES * 60);

  if (signedError || !signedData) {
    return new Response(JSON.stringify({ error: 'No se pudo generar URL de descarga' }), { status: 500 });
  }

  const expiresAt = new Date(Date.now() + EXPIRES_MINUTES * 60 * 1000).toISOString();

  return new Response(
    JSON.stringify({ download_url: signedData.signedUrl, expires_at: expiresAt }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
