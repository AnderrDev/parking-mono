-- Test 03: matriz RLS de parking_sessions por rol
-- Spec: specs/rls-policies.spec.md §"parking_sessions"
--
-- Setup: crea 3 users (admin, operador, contador) y simula su JWT con set_config.
-- Roles Postgres en Supabase: 'authenticated' (cliente normal) bypasseable solo por
-- 'service_role'. Los tests usan SET LOCAL ROLE authenticated + JWT claim manual.

\set ON_ERROR_STOP on
\echo '=== TEST 03: parking_sessions RLS matrix ==='

-- Cleanup idempotente previo
DELETE FROM parking_sessions WHERE vehicle_plate LIKE 'RLS\_%' ESCAPE '\';
DELETE FROM public.users WHERE email LIKE 'rls\_%@test.local' ESCAPE '\';
DELETE FROM auth.users WHERE email LIKE 'rls\_%@test.local' ESCAPE '\';

-- Setup
DO $setup$
DECLARE
  admin_uid UUID;
  operador_uid UUID;
  contador_uid UUID;
  tariff_uid UUID;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, is_anonymous
  ) VALUES (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated', 'authenticated',
    'rls_admin@test.local', crypt('test12345', gen_salt('bf')),
    now(), now(), now(),
    '{"role":"admin"}'::jsonb, '{}'::jsonb, FALSE, FALSE
  ) RETURNING id INTO admin_uid;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, is_anonymous
  ) VALUES (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated', 'authenticated',
    'rls_operador@test.local', crypt('test12345', gen_salt('bf')),
    now(), now(), now(),
    '{"role":"operador"}'::jsonb, '{}'::jsonb, FALSE, FALSE
  ) RETURNING id INTO operador_uid;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, is_anonymous
  ) VALUES (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated', 'authenticated',
    'rls_contador@test.local', crypt('test12345', gen_salt('bf')),
    now(), now(), now(),
    '{"role":"contador"}'::jsonb, '{}'::jsonb, FALSE, FALSE
  ) RETURNING id INTO contador_uid;

  INSERT INTO public.users (id, email, role, nombre, is_active) VALUES
    (admin_uid,    'rls_admin@test.local',    'admin',    'Admin RLS',    TRUE),
    (operador_uid, 'rls_operador@test.local', 'operador', 'Operador RLS', TRUE),
    (contador_uid, 'rls_contador@test.local', 'contador', 'Contador RLS', TRUE);

  SELECT id INTO tariff_uid FROM public.tariffs WHERE is_active = TRUE LIMIT 1;

  -- Persistir uids en una temp table para tests posteriores
  DROP TABLE IF EXISTS rls_test_setup;
  CREATE TEMP TABLE rls_test_setup (
    role_name TEXT PRIMARY KEY,
    uid UUID NOT NULL,
    tariff_id UUID
  );
  INSERT INTO rls_test_setup VALUES
    ('admin',    admin_uid,    tariff_uid),
    ('operador', operador_uid, tariff_uid),
    ('contador', contador_uid, tariff_uid);
END
$setup$;

-- =============================================
\echo '--- subtest 3.1: operador inserta entrada propia ---'
-- =============================================
DO $t31$
DECLARE
  op_uid UUID;
  t_uid UUID;
  inserted_id UUID;
BEGIN
  SELECT uid, tariff_id INTO op_uid, t_uid FROM rls_test_setup WHERE role_name = 'operador';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', op_uid::text, 'role', 'operador')::text, TRUE);
  SET LOCAL ROLE authenticated;

  INSERT INTO parking_sessions (vehicle_plate, vehicle_type, entry_at, tariff_id, entry_user_id)
  VALUES ('RLS_OWN', 'carro', now(), t_uid, op_uid)
  RETURNING id INTO inserted_id;

  RESET ROLE;

  IF inserted_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: insert no retornó id';
  END IF;
  RAISE NOTICE 'PASS: operador insertó entrada propia';
END
$t31$;

-- =============================================
\echo '--- subtest 3.2: operador NO inserta con uid de otro ---'
-- =============================================
DO $t32$
DECLARE
  op_uid UUID;
  admin_uid UUID;
  t_uid UUID;
  caught BOOLEAN := FALSE;
BEGIN
  SELECT uid INTO op_uid FROM rls_test_setup WHERE role_name = 'operador';
  SELECT uid, tariff_id INTO admin_uid, t_uid FROM rls_test_setup WHERE role_name = 'admin';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', op_uid::text, 'role', 'operador')::text, TRUE);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO parking_sessions (vehicle_plate, vehicle_type, entry_at, tariff_id, entry_user_id)
    VALUES ('RLS_OTHER', 'carro', now(), t_uid, admin_uid);
  EXCEPTION WHEN OTHERS THEN
    caught := TRUE;
    RAISE NOTICE 'PASS: insert con uid ajeno bloqueado (SQLSTATE=%)', SQLSTATE;
  END;

  RESET ROLE;

  IF NOT caught THEN
    RAISE EXCEPTION 'FAIL: insert con entry_user_id ajeno fue permitido';
  END IF;
END
$t32$;

-- =============================================
\echo '--- subtest 3.3: contador no inserta pero lee todo ---'
-- =============================================
DO $t33$
DECLARE
  cont_uid UUID;
  t_uid UUID;
  read_count INT;
  caught BOOLEAN := FALSE;
BEGIN
  SELECT uid, tariff_id INTO cont_uid, t_uid FROM rls_test_setup WHERE role_name = 'contador';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', cont_uid::text, 'role', 'contador')::text, TRUE);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO parking_sessions (vehicle_plate, vehicle_type, entry_at, tariff_id, entry_user_id)
    VALUES ('RLS_CONT', 'carro', now(), t_uid, cont_uid);
  EXCEPTION WHEN OTHERS THEN
    caught := TRUE;
    RAISE NOTICE 'PASS: contador no puede insertar (SQLSTATE=%)', SQLSTATE;
  END;

  IF NOT caught THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL: contador pudo insertar';
  END IF;

  -- Read: contador debe ver la entrada del operador
  SELECT count(*) INTO read_count FROM parking_sessions WHERE vehicle_plate = 'RLS_OWN';

  RESET ROLE;

  IF read_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: contador vio % rows con plate RLS_OWN, esperaba 1', read_count;
  END IF;
  RAISE NOTICE 'PASS: contador puede leer todo (count=%)', read_count;
END
$t33$;

-- =============================================
\echo '--- subtest 3.4: admin puede hacer todo ---'
-- =============================================
DO $t34$
DECLARE
  admin_uid UUID;
  t_uid UUID;
  inserted_id UUID;
BEGIN
  SELECT uid, tariff_id INTO admin_uid, t_uid FROM rls_test_setup WHERE role_name = 'admin';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', admin_uid::text, 'role', 'admin')::text, TRUE);
  SET LOCAL ROLE authenticated;

  INSERT INTO parking_sessions (vehicle_plate, vehicle_type, entry_at, tariff_id, entry_user_id)
  VALUES ('RLS_ADMIN', 'carro', now(), t_uid, admin_uid)
  RETURNING id INTO inserted_id;

  UPDATE parking_sessions SET status = 'cancelled' WHERE id = inserted_id;

  RESET ROLE;

  IF inserted_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: admin no pudo insertar';
  END IF;
  RAISE NOTICE 'PASS: admin insertó y actualizó';
END
$t34$;

-- =============================================
-- Cleanup
-- =============================================
DELETE FROM parking_sessions WHERE vehicle_plate LIKE 'RLS\_%' ESCAPE '\';
DELETE FROM public.users WHERE email LIKE 'rls\_%@test.local' ESCAPE '\';
DELETE FROM auth.users WHERE email LIKE 'rls\_%@test.local' ESCAPE '\';

\echo '=== TEST 03 OK ==='
