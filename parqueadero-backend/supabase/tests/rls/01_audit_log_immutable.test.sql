-- Test 01: audit_log es inmutable (UPDATE y DELETE bloqueados por trigger)
-- Spec: specs/rls-policies.spec.md §"audit_log doble defensa"

\set ON_ERROR_STOP on
\echo '=== TEST 01: audit_log immutable ==='

BEGIN;

-- Insert directo (corremos como postgres superuser que bypassa RLS).
-- El trigger de inmutabilidad solo afecta UPDATE/DELETE, no INSERT.
INSERT INTO audit_log (user_id, action, entity_type, entity_id, after_json)
VALUES (NULL, 'INSERT', 'test_table', '00000000-0000-0000-0000-000000000099', '{"test":true}'::jsonb);

\echo '--- subtest: UPDATE on audit_log must raise exception ---'
DO $$
DECLARE
  caught BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE audit_log SET action = 'DELETE'
    WHERE entity_id = '00000000-0000-0000-0000-000000000099';
  EXCEPTION WHEN OTHERS THEN
    caught := TRUE;
    RAISE NOTICE 'PASS: UPDATE bloqueado (% — %)', SQLSTATE, SQLERRM;
  END;

  IF NOT caught THEN
    RAISE EXCEPTION 'FAIL: UPDATE no fue bloqueado por trigger';
  END IF;
END
$$;

\echo '--- subtest: DELETE on audit_log must raise exception ---'
DO $$
DECLARE
  caught BOOLEAN := FALSE;
BEGIN
  BEGIN
    DELETE FROM audit_log WHERE entity_id = '00000000-0000-0000-0000-000000000099';
  EXCEPTION WHEN OTHERS THEN
    caught := TRUE;
    RAISE NOTICE 'PASS: DELETE bloqueado (% — %)', SQLSTATE, SQLERRM;
  END;

  IF NOT caught THEN
    RAISE EXCEPTION 'FAIL: DELETE no fue bloqueado por trigger';
  END IF;
END
$$;

ROLLBACK;
\echo '=== TEST 01 OK ==='
