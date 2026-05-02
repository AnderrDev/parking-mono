-- Test 04: siigo_invoice_attempts es append-only + RLS bloquea authenticated/anon
-- Spec: specs/rls-policies-siigo.spec.md §"siigo_invoice_attempts"
--       specs/database-schema-siigo-delta.spec.md §"siigo_invoice_attempts"

\set ON_ERROR_STOP on
\echo '=== TEST 04: siigo_invoice_attempts append-only + RLS ==='

BEGIN;

-- Insert directo (corremos como postgres superuser → bypassa RLS).
-- El trigger de inmutabilidad solo afecta UPDATE/DELETE, no INSERT.
INSERT INTO siigo_invoice_attempts (invoice_id, attempt_number, operation, http_method, http_url, http_status, latency_ms)
VALUES (NULL, 1, 'auth', 'POST', 'https://api.siigo.com/auth', 200, 123);

\echo '--- subtest 4.1: UPDATE on siigo_invoice_attempts must raise exception ---'
DO $t41$
DECLARE
  caught BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE siigo_invoice_attempts SET http_status = 500
    WHERE operation = 'auth';
  EXCEPTION WHEN OTHERS THEN
    caught := TRUE;
    RAISE NOTICE 'PASS: UPDATE bloqueado (% — %)', SQLSTATE, SQLERRM;
  END;

  IF NOT caught THEN
    RAISE EXCEPTION 'FAIL: UPDATE no fue bloqueado por trigger';
  END IF;
END
$t41$;

\echo '--- subtest 4.2: DELETE on siigo_invoice_attempts must raise exception ---'
DO $t42$
DECLARE
  caught BOOLEAN := FALSE;
BEGIN
  BEGIN
    DELETE FROM siigo_invoice_attempts WHERE operation = 'auth';
  EXCEPTION WHEN OTHERS THEN
    caught := TRUE;
    RAISE NOTICE 'PASS: DELETE bloqueado (% — %)', SQLSTATE, SQLERRM;
  END;

  IF NOT caught THEN
    RAISE EXCEPTION 'FAIL: DELETE no fue bloqueado por trigger';
  END IF;
END
$t42$;

\echo '--- subtest 4.3: authenticated cannot SELECT siigo_invoice_attempts ---'
DO $t43$
DECLARE
  visible_count INT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-000000000099', 'role', 'admin')::text, TRUE);
  SET LOCAL ROLE authenticated;

  -- RLS sin policy para authenticated → 0 filas devueltas (no error, pero vacío).
  SELECT count(*) INTO visible_count FROM siigo_invoice_attempts;

  RESET ROLE;

  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: authenticated vio % filas, esperaba 0', visible_count;
  END IF;
  RAISE NOTICE 'PASS: authenticated SELECT devuelve 0 filas';
END
$t43$;

\echo '--- subtest 4.4: authenticated cannot INSERT siigo_invoice_attempts ---'
DO $t44$
DECLARE
  caught BOOLEAN := FALSE;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-000000000099', 'role', 'admin')::text, TRUE);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO siigo_invoice_attempts (attempt_number, operation, http_method, http_url, http_status)
    VALUES (1, 'emit', 'POST', 'https://api.siigo.com/v1/invoices', 200);
  EXCEPTION WHEN OTHERS THEN
    caught := TRUE;
    RAISE NOTICE 'PASS: authenticated INSERT bloqueado (SQLSTATE=%)', SQLSTATE;
  END;

  RESET ROLE;

  IF NOT caught THEN
    RAISE EXCEPTION 'FAIL: authenticated logró insertar';
  END IF;
END
$t44$;

ROLLBACK;
\echo '=== TEST 04 OK ==='
