// Case 06 — Intento de UPDATE/DELETE en audit_log debe ser bloqueado.
// audit_log es append-only: ningún rol (incluido admin) puede modificarlo.

import { makeJwt, SUPABASE_REST, SUPABASE_ANON_KEY } from '../helpers/make-jwt.ts';

const ADMIN_UID = Deno.env.get('PENTEST_ADMIN_UID');
if (!ADMIN_UID) {
  console.error('FAIL setup: PENTEST_ADMIN_UID no seteado');
  Deno.exit(2);
}

const jwt = await makeJwt({ sub: ADMIN_UID, user_role: 'admin' });

// Intento UPDATE arbitrario.
const updateRes = await fetch(`${SUPABASE_REST}/audit_log?id=eq.${crypto.randomUUID()}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${jwt}`,
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'TAMPERED' }),
});

if (updateRes.status >= 200 && updateRes.status < 300) {
  console.error(`FAIL case 06: admin pudo PATCH audit_log (HTTP ${updateRes.status})`);
  Deno.exit(1);
}

// Intento DELETE.
const deleteRes = await fetch(`${SUPABASE_REST}/audit_log?id=eq.${crypto.randomUUID()}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${jwt}`,
    'apikey': SUPABASE_ANON_KEY,
  },
});

if (deleteRes.status >= 200 && deleteRes.status < 300) {
  console.error(`FAIL case 06: admin pudo DELETE audit_log (HTTP ${deleteRes.status})`);
  Deno.exit(1);
}

console.log(`PASS case 06: PATCH bloqueado (HTTP ${updateRes.status}), DELETE bloqueado (HTTP ${deleteRes.status})`);
