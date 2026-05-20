// Case 01 — Operador con `user_role=admin` inyectado intenta INSERT en tariffs.
// PASS = HTTP 4xx. FAIL = 2xx (escalada de privilegios real).

import { makeJwt, SUPABASE_REST, SUPABASE_ANON_KEY } from '../helpers/make-jwt.ts';

const OPERADOR_UID = Deno.env.get('PENTEST_OPERADOR_UID');
if (!OPERADOR_UID) {
  console.error('FAIL setup: PENTEST_OPERADOR_UID no seteado');
  Deno.exit(2);
}

const jwt = await makeJwt({
  sub: OPERADOR_UID,
  user_role: 'admin', // claim manipulado — debe ser ignorado por RLS
});

const res = await fetch(`${SUPABASE_REST}/tariffs`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwt}`,
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  },
  body: JSON.stringify({
    name: 'pen-test-01',
    vehicle_type: 'carro',
    unit: 'hourly',
    rate_cents: 1,
  }),
});

if (res.status >= 200 && res.status < 300) {
  const body = await res.text();
  console.error(`FAIL case 01: operador con user_role=admin pudo INSERT en tariffs (HTTP ${res.status})`);
  console.error('Response body:', body);
  Deno.exit(1);
}
console.log(`PASS case 01: bloqueado con HTTP ${res.status}`);
