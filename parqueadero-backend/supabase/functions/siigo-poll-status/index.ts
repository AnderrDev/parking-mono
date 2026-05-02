// Edge Function: siigo-poll-status (cron)
// Spec: ../../specs/edge-functions/siigo-poll-status.spec.md
//
// Llamada por pg_cron cada 30 s. Procesa hasta 20 invoices no-terminales por
// tick, llama GET /v1/invoices/{siigo_id} a Siigo y actualiza estado.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSiigoToken } from '../_shared/siigo/auth.ts';
import { siigoFetch } from '../_shared/siigo/client.ts';
import { mapStampStatus } from '../_shared/siigo/poll-mapper.ts';
import type { SiigoInvoiceResponse, SiigoStatusInternal } from '../_shared/siigo/types.ts';
import { SiigoAuthError } from '../_shared/siigo/errors.ts';

const SIIGO_BASE_URL = (Deno.env.get('SIIGO_BASE_URL') ?? 'https://api.siigo.com').replace(/\/$/, '');
const MAX_RETRIES = Number(Deno.env.get('SIIGO_POLL_MAX_RETRIES') ?? '30');

interface PollCandidate {
  id: string;
  siigo_id: string;
  siigo_status: string;
  siigo_attempts: number;
  siigo_last_attempt_at: string | null;
}

interface Summary {
  processed: number;
  stamped: number;
  rejected: number;
  still_pending: number;
  errored: number;
  exhausted: number;
  duration_ms: number;
}

const TERMINAL: Set<SiigoStatusInternal> = new Set(['Stamped', 'Rejected']);

Deno.serve(async (req: Request) => {
  // Solo POST. El cron pg_net hace POST.
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // Auth: solo service_role key. No usamos auth.getUser() — el cron no es un usuario.
  if (!isServiceRoleAuthorized(req)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // Limit configurable via query string para tests manuales.
  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get('limit'));

  const start = performance.now();

  // Candidatos a polling
  const { data, error: rpcErr } = await supabase.rpc('get_invoices_for_polling', { p_limit: limit });

  if (rpcErr) {
    return jsonResponse({ error: 'rpc get_invoices_for_polling falló', details: rpcErr.message }, 500);
  }
  const candidates = (Array.isArray(data) ? data : []) as PollCandidate[];

  const summary: Summary = {
    processed: 0,
    stamped: 0,
    rejected: 0,
    still_pending: 0,
    errored: 0,
    exhausted: 0,
    duration_ms: 0,
  };

  // Tick vacío — no tiene sentido pedir token. Esto también permite que el cron
  // arranque sin haber configurado las envs Siigo todavía.
  if (candidates.length === 0) {
    summary.duration_ms = Math.round(performance.now() - start);
    return jsonResponse(summary, 200);
  }

  // Token Siigo (lazy). Si /auth falla, 503; el siguiente tick reintenta.
  let token: string;
  try {
    token = await getSiigoToken(supabase);
  } catch (err) {
    if (err instanceof SiigoAuthError) {
      return jsonResponse({ error: 'Siigo Auth no disponible', details: err.message }, 503);
    }
    throw err;
  }

  // Procesar en serie para no saturar el rate limit Siigo (~50/min).
  for (const candidate of candidates) {
    summary.processed++;
    const result = await pollOne(supabase, token, candidate);

    switch (result) {
      case 'Stamped':       summary.stamped++; break;
      case 'Rejected':      summary.rejected++; break;
      case 'still_pending': summary.still_pending++; break;
      case 'errored':       summary.errored++; break;
      case 'exhausted':     summary.exhausted++; break;
    }
  }

  summary.duration_ms = Math.round(performance.now() - start);
  return jsonResponse(summary, 200);
});

// ─────────────────────────────────────────────────────────────────────
// Procesamiento individual
// ─────────────────────────────────────────────────────────────────────

type PollOutcome = 'Stamped' | 'Rejected' | 'still_pending' | 'errored' | 'exhausted';

async function pollOne(
  supabase: SupabaseClient,
  token: string,
  candidate: PollCandidate,
): Promise<PollOutcome> {
  const newAttempts = candidate.siigo_attempts + 1;
  const now = new Date().toISOString();

  let outcome: PollOutcome = 'errored';
  let patch: Record<string, unknown> = {
    siigo_attempts: newAttempts,
    siigo_last_attempt_at: now,
  };

  try {
    const res = await siigoFetch<SiigoInvoiceResponse>(
      supabase,
      { invoiceId: candidate.id, operation: 'poll', attemptNumber: newAttempts },
      token,
      SIIGO_BASE_URL,
      `/v1/invoices/${encodeURIComponent(candidate.siigo_id)}`,
      { method: 'GET' },
    );

    if (res.ok && res.body) {
      const stamp = mapStampStatus(res.body);

      if (stamp.status === 'Stamped' || stamp.status === 'Rejected') {
        patch = {
          ...patch,
          siigo_status: stamp.status,
          siigo_number: stamp.number,
          siigo_cufe: stamp.cufe,
          siigo_cude: stamp.cude,
          siigo_pdf_url: stamp.pdfUrl,
          siigo_xml_url: stamp.xmlUrl,
          siigo_qr_url: stamp.qrUrl,
          siigo_observations: stamp.observations.length > 0 ? stamp.observations : null,
          siigo_last_error: stamp.status === 'Rejected'
            ? (stamp.observations[0] ?? 'Rechazada por DIAN')
            : null,
        };
        outcome = stamp.status;
      } else {
        // Sigue no-terminal. Si llegamos al techo, marcamos error_max_retries.
        if (newAttempts >= MAX_RETRIES) {
          patch = {
            ...patch,
            siigo_status: 'error_max_retries',
            siigo_last_error: 'exhausted retries',
          };
          outcome = 'exhausted';
        } else {
          patch = { ...patch, siigo_status: stamp.status };
          outcome = 'still_pending';
        }
      }
    } else {
      // 4xx/5xx no esperado durante GET: contamos como intento, no terminal.
      const errMsg = `HTTP ${res.status}`;
      if (newAttempts >= MAX_RETRIES) {
        patch = { ...patch, siigo_status: 'error_max_retries', siigo_last_error: errMsg };
        outcome = 'exhausted';
      } else {
        patch = { ...patch, siigo_last_error: errMsg };
        outcome = 'errored';
      }
    }
  } catch (err) {
    // Network / timeout
    const msg = err instanceof Error ? err.message : String(err);
    if (newAttempts >= MAX_RETRIES) {
      patch = { ...patch, siigo_status: 'error_max_retries', siigo_last_error: msg };
      outcome = 'exhausted';
    } else {
      patch = { ...patch, siigo_last_error: msg };
      outcome = 'errored';
    }
  }

  // Persistir el patch. Si falla, el log queda en stderr y la próxima
  // ejecución del cron tomará la fila otra vez (siempre que el filtro de
  // backoff lo permita).
  const { error } = await supabase.from('invoices').update(patch).eq('id', candidate.id);
  if (error) {
    console.error(`[siigo:poll] fallo UPDATE invoice ${candidate.id}:`, error.message);
  }

  return outcome;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function isServiceRoleAuthorized(req: Request): boolean {
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!expected) return false;
  const header = req.headers.get('Authorization');
  if (!header) return false;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return false;
  return parts[1] === expected;
}

function clampLimit(raw: string | null): number {
  const n = Number(raw ?? '20');
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(50, Math.floor(n));
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}
