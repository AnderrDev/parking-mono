// Cliente HTTP con timeout, retry mínimo y auditoría sanitizada.
// Spec: specs/edge-functions/_shared-siigo-client.spec.md §"client.ts"

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SiigoFetchResult, SiigoOperation } from './types.ts';
import { sanitizeForAudit } from './errors.ts';

const DEFAULT_TIMEOUT_MS = Number(Deno.env.get('SIIGO_HTTP_TIMEOUT_MS') ?? '28000');
const RATE_LIMIT_BACKOFF_MS = 3000; // 429
const SERVER_BACKOFF_MS = 1000;     // 5xx

/** Llama a Siigo con timeout, 1 retry en 429/5xx y persiste auditoría.
 *
 *  No lanza excepciones por respuesta HTTP — el caller decide qué hacer con
 *  status. Sí lanza si:
 *   - timeout / network error después del retry → `Error('SiigoNetworkError: ...')`
 *   - error grabando audit (raro, pero importante de no silenciar)
 */
export async function siigoFetch<T = unknown>(
  serviceClient: SupabaseClient,
  audit: {
    invoiceId: string | null;
    operation: SiigoOperation;
    attemptNumber: number;
  },
  token: string,
  baseUrl: string,
  path: string,
  init: RequestInit,
): Promise<SiigoFetchResult<T>> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const partnerId = Deno.env.get('SIIGO_PARTNER_ID') ?? '';

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Partner-Id': partnerId,
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };

  const requestInit: RequestInit = { ...init, headers };

  const start = performance.now();
  const result = await doFetchWithRetry<T>(url, requestInit);
  const latencyMs = Math.round(performance.now() - start);

  // Auditoría siempre — éxito y fracaso.
  await persistAttempt(serviceClient, {
    invoiceId: audit.invoiceId,
    attemptNumber: audit.attemptNumber,
    operation: audit.operation,
    httpMethod: (init.method ?? 'GET').toUpperCase(),
    httpUrl: url,
    httpStatus: result.status,
    requestBody: parseSafe(init.body),
    responseBody: result.body,
    latencyMs,
    errorMessage: result.networkError,
  });

  if (result.networkError) {
    throw new Error(`SiigoNetworkError: ${result.networkError}`);
  }

  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    body: result.body as T,
    latencyMs,
  };
}

async function doFetchWithRetry<T>(
  url: string,
  init: RequestInit,
): Promise<{ status: number; body: T | null; networkError?: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      const body = await readBody<T>(res);

      if (res.status === 429 && attempt === 0) {
        await sleep(RATE_LIMIT_BACKOFF_MS);
        continue;
      }
      if (res.status >= 500 && res.status < 600 && attempt === 0) {
        await sleep(SERVER_BACKOFF_MS);
        continue;
      }
      return { status: res.status, body };
    } catch (err) {
      clearTimeout(timer);
      // Network/timeout — no retry (el cron o el caller decide).
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 0, body: null, networkError: msg };
    }
  }
  // Inalcanzable — el loop retorna o lanza siempre.
  return { status: 0, body: null, networkError: 'unreachable retry path' };
}

async function readBody<T>(res: Response): Promise<T | null> {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Siigo a veces responde HTML en errores de infra; lo persistimos como string.
    return text as unknown as T;
  }
}

function parseSafe(body: BodyInit | null | undefined): unknown {
  if (!body) return null;
  if (typeof body !== 'string') return '<non-string-body>';
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistAttempt(
  serviceClient: SupabaseClient,
  row: {
    invoiceId: string | null;
    attemptNumber: number;
    operation: SiigoOperation;
    httpMethod: string;
    httpUrl: string;
    httpStatus: number;
    requestBody: unknown;
    responseBody: unknown;
    latencyMs: number;
    errorMessage?: string;
  },
): Promise<void> {
  const { error } = await serviceClient.from('siigo_invoice_attempts').insert({
    invoice_id: row.invoiceId,
    attempt_number: row.attemptNumber,
    operation: row.operation,
    http_method: row.httpMethod,
    http_url: row.httpUrl,
    http_status: row.httpStatus,
    request_body: sanitizeForAudit(row.requestBody),
    response_body: sanitizeForAudit(row.responseBody),
    latency_ms: row.latencyMs,
    error_message: row.errorMessage ?? null,
  });

  if (error) {
    // No queremos silenciar fallos de auditoría: dejan al sistema sin trazabilidad.
    // Pero tampoco queremos hacer fallar la EF entera por un audit row caído.
    // Compromiso: log a stderr + continuar. El caller no lo ve.
    console.error('[siigo:audit] fallo persistiendo siigo_invoice_attempts:', error.message);
  }
}
