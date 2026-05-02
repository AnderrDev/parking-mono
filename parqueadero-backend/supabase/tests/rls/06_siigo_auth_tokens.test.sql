-- Test 06: siigo_auth_tokens accesible solo a service_role
-- Spec: specs/rls-policies-siigo.spec.md §"siigo_auth_tokens"

\set ON_ERROR_STOP on
\echo '=== TEST 06: siigo_auth_tokens RLS ==='

BEGIN;

-- Setup: insertar el token cacheado (como superuser, bypassa RLS)
INSERT INTO siigo_auth_tokens (id, access_token, expires_at)
VALUES (1, 'fake-bearer-test-token', now() + interval '23 hours');

\echo '--- subtest 6.1: CHECK (id=1) bloquea filas adicionales ---'
DO $t61$
DECLARE
  caught BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO siigo_auth_tokens (id, access_token, expires_at)
    VALUES (2, 'another-token', now() + interval '1 hour');
  EXCEPTION WHEN OTHERS THEN
    caught := TRUE;
    RAISE NOTICE 'PASS: insert con id<>1 bloqueado (SQLSTATE=%)', SQLSTATE;
  END;

  IF NOT caught THEN
    RAISE EXCEPTION 'FAIL: pude insertar id=2 violando CHECK (id=1)';
  END IF;
END
$t61$;

\echo '--- subtest 6.2: authenticated NO puede SELECT ---'
DO $t62$
DECLARE
  visible_count INT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-000000000099', 'role', 'admin')::text, TRUE);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO visible_count FROM siigo_auth_tokens;

  RESET ROLE;

  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: authenticated vio % filas, esperaba 0', visible_count;
  END IF;
  RAISE NOTICE 'PASS: authenticated SELECT devuelve 0 filas';
END
$t62$;

\echo '--- subtest 6.3: authenticated NO puede INSERT/UPDATE/DELETE ---'
DO $t63$
DECLARE
  caught_ins BOOLEAN := FALSE;
  caught_upd BOOLEAN := FALSE;
  caught_del BOOLEAN := FALSE;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-000000000099', 'role', 'admin')::text, TRUE);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO siigo_auth_tokens (id, access_token, expires_at)
    VALUES (1, 'leaked', now() + interval '1 hour');
  EXCEPTION WHEN OTHERS THEN
    caught_ins := TRUE;
  END;

  BEGIN
    UPDATE siigo_auth_tokens SET access_token = 'tampered' WHERE id = 1;
  EXCEPTION WHEN OTHERS THEN
    caught_upd := TRUE;
  END;

  BEGIN
    DELETE FROM siigo_auth_tokens WHERE id = 1;
  EXCEPTION WHEN OTHERS THEN
    caught_del := TRUE;
  END;

  RESET ROLE;

  -- Si la operación no rompió pero tampoco afectó filas (RLS silencioso),
  -- también es un PASS. Verificamos el estado final.
  IF (SELECT access_token FROM siigo_auth_tokens WHERE id = 1) <> 'fake-bearer-test-token' THEN
    RAISE EXCEPTION 'FAIL: authenticated logró mutar el token (valor actual diferente al setup)';
  END IF;
  RAISE NOTICE 'PASS: authenticated no logró mutar token (insert=% update=% delete=% — RLS silenció o rechazó)',
    caught_ins, caught_upd, caught_del;
END
$t63$;

ROLLBACK;
\echo '=== TEST 06 OK ==='
