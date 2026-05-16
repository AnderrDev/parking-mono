// Helper para firmar JWTs HS256 con el secret local de Supabase.
// Permite manipular claims (role, user_role, sub, etc.) para simular atacantes.

import { create as signJwt, type Header, type Payload } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

/**
 * Crea un JWT firmado con el secret de Supabase local.
 *
 * @param overrides claims a inyectar/sobrescribir en el payload
 * @returns JWT string (header.payload.signature)
 */
export async function makeJwt(overrides: Partial<Payload> = {}): Promise<string> {
  const secret = Deno.env.get('SUPABASE_JWT_SECRET');
  if (!secret) {
    throw new Error(
      'SUPABASE_JWT_SECRET no está seteado. ' +
        'Exportar con: export SUPABASE_JWT_SECRET=$(supabase status | grep "JWT secret" | awk \'{print $3}\')',
    );
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const header: Header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload: Payload = {
    iss: 'supabase',
    aud: 'authenticated',
    iat: now,
    exp: now + 3600,
    role: 'authenticated', // claim PostgREST estándar
    ...overrides,
  };
  return await signJwt(header, payload, key);
}

export const SUPABASE_REST = Deno.env.get('SUPABASE_REST_URL') ?? 'http://127.0.0.1:54321/rest/v1';
export const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
