// Auth + cache de bearer token Siigo (vence ~24 h).
// Spec: specs/edge-functions/_shared-siigo-client.spec.md §"auth.ts"

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SiigoAuthResponse } from './types.ts';
import { SiigoAuthError, sanitizeForAudit } from './errors.ts';

/** Margen de seguridad: si al token le quedan < 5 min, lo refrescamos. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Vida útil que persistimos (Siigo dice 24h; usamos 23h para tener margen). */
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

interface CachedTokenRow {
  access_token: string;
  expires_at: string; // ISO
}

/** Devuelve un bearer token Siigo válido. Cachea en `siigo_auth_tokens` (single-row).
 *
 *  Si `forceRefresh = true`, ignora el cache. Útil cuando una request anterior
 *  recibió 401 y queremos asegurarnos de no servir el mismo token caducado.
 */
export async function getSiigoToken(
  serviceClient: SupabaseClient,
  forceRefresh = false,
): Promise<string> {
  if (!forceRefresh) {
    const cached = await readCached(serviceClient);
    if (cached) {
      const expiresAt = Date.parse(cached.expires_at);
      if (Number.isFinite(expiresAt) && expiresAt - Date.now() > REFRESH_MARGIN_MS) {
        return cached.access_token;
      }
    }
  }

  const fresh = await fetchFromSiigo(serviceClient);
  await persistToken(serviceClient, fresh);
  return fresh;
}

async function readCached(serviceClient: SupabaseClient): Promise<CachedTokenRow | null> {
  const { data, error } = await serviceClient
    .from('siigo_auth_tokens')
    .select('access_token, expires_at')
    .eq('id', 1)
    .maybeSingle<CachedTokenRow>();

  if (error || !data) return null;
  return data;
}

async function fetchFromSiigo(serviceClient: SupabaseClient): Promise<string> {
  const baseUrl = (Deno.env.get('SIIGO_BASE_URL') ?? 'https://api.siigo.com').replace(/\/$/, '');
  const username = Deno.env.get('SIIGO_USERNAME') ?? '';
  const accessKey = Deno.env.get('SIIGO_ACCESS_KEY') ?? '';
  const partnerId = Deno.env.get('SIIGO_PARTNER_ID') ?? '';

  if (!username || !accessKey || !partnerId) {
    throw new SiigoAuthError('SIIGO_USERNAME / SIIGO_ACCESS_KEY / SIIGO_PARTNER_ID no configurados');
  }

  const url = `${baseUrl}/auth`;
  const start = performance.now();
  let status = 0;
  let body: SiigoAuthResponse | { error?: string } | null = null;
  let networkError: string | undefined;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Partner-Id': partnerId,
      },
      body: JSON.stringify({ username, access_key: accessKey }),
    });
    status = res.status;
    body = await res.json().catch(() => null);
  } catch (err) {
    networkError = err instanceof Error ? err.message : String(err);
  }

  const latencyMs = Math.round(performance.now() - start);

  // Auditar SIEMPRE — sanitizar credenciales antes.
  await serviceClient.from('siigo_invoice_attempts').insert({
    invoice_id: null,
    attempt_number: 1,
    operation: 'auth',
    http_method: 'POST',
    http_url: url,
    http_status: status,
    request_body: sanitizeForAudit({ username, access_key: accessKey }),
    response_body: sanitizeForAudit(body),
    latency_ms: latencyMs,
    error_message: networkError ?? null,
  }).then(({ error }) => {
    if (error) console.error('[siigo:auth:audit] fallo persistiendo:', error.message);
  });

  if (networkError) {
    throw new SiigoAuthError(`Network: ${networkError}`);
  }
  if (status < 200 || status >= 300 || !body || !('access_token' in body) || !body.access_token) {
    const msg = body && typeof body === 'object' && 'error' in body
      ? String((body as { error?: unknown }).error ?? '')
      : `HTTP ${status}`;
    throw new SiigoAuthError(`Siigo /auth falló: ${msg}`, status);
  }

  return (body as SiigoAuthResponse).access_token;
}

async function persistToken(serviceClient: SupabaseClient, accessToken: string): Promise<void> {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const fetchedAt = new Date().toISOString();

  const { error } = await serviceClient
    .from('siigo_auth_tokens')
    .upsert(
      { id: 1, access_token: accessToken, expires_at: expiresAt, fetched_at: fetchedAt },
      { onConflict: 'id' },
    );

  if (error) {
    // No bloqueamos: el token está en memoria y la EF puede usarlo para esta request.
    // En la siguiente invocación se intentará refrescar de nuevo.
    console.error('[siigo:auth] fallo cacheando token en siigo_auth_tokens:', error.message);
  }
}
