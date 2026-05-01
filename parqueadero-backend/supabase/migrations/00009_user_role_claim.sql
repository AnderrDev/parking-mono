-- Migration 00009: renombra el claim de aplicación de `role` a `user_role` en el JWT.
--
-- Problema: el JWT claim `role` es interceptado por PostgREST para hacer SET ROLE en
-- PostgreSQL. Como 'admin', 'operador' y 'contador' no son roles PG, el API devolvía
-- 401 "role does not exist" en cada request autenticado.
--
-- Solución:
--   1. Hook inyecta el rol de aplicación en `user_role` (no en `role`).
--   2. Todas las políticas RLS pasan de auth.jwt() ->> 'role' a ->> 'user_role'.
--   El claim `role` queda como 'authenticated' para que PostgREST funcione.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Actualizar custom_access_token_hook: inyectar `user_role` en vez de `role`
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role  TEXT;
  claims     jsonb;
BEGIN
  SELECT role INTO user_role
  FROM public.users
  WHERE id = (event ->> 'user_id')::uuid;

  IF user_role IS NULL THEN
    RETURN event;
  END IF;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  event  := jsonb_set(event, '{claims}', claims);

  RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. audit_log policy (00001)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_log_admin_contador_read" ON audit_log;
CREATE POLICY "audit_log_admin_contador_read" ON audit_log
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') IN ('admin', 'contador'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. users policies (00003)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_admin_all"            ON users;
DROP POLICY IF EXISTS "users_operador_read_own"    ON users;
DROP POLICY IF EXISTS "users_contador_read_active" ON users;

CREATE POLICY "users_admin_all" ON users
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "users_operador_read_own" ON users
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'operador' AND id = auth.uid());

CREATE POLICY "users_contador_read_active" ON users
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'contador' AND is_active = TRUE);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. customers
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "customers_admin_all"    ON customers;
DROP POLICY IF EXISTS "customers_operador_read" ON customers;
DROP POLICY IF EXISTS "customers_contador_read" ON customers;

CREATE POLICY "customers_admin_all" ON customers
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "customers_operador_read" ON customers
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'operador');

CREATE POLICY "customers_contador_read" ON customers
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'contador');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. vehicles
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "vehicles_admin_all"          ON vehicles;
DROP POLICY IF EXISTS "vehicles_authenticated_read" ON vehicles;

CREATE POLICY "vehicles_admin_all" ON vehicles
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "vehicles_authenticated_read" ON vehicles
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') IN ('admin', 'operador', 'contador'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. tariffs
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tariffs_admin_all"                   ON tariffs;
DROP POLICY IF EXISTS "tariffs_authenticated_read_active"   ON tariffs;

CREATE POLICY "tariffs_admin_all" ON tariffs
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "tariffs_authenticated_read_active" ON tariffs
  FOR SELECT TO authenticated
  USING (is_active = TRUE AND _deleted = FALSE);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. monthly_plans
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "monthly_plans_admin_all"    ON monthly_plans;
DROP POLICY IF EXISTS "monthly_plans_operador_read" ON monthly_plans;
DROP POLICY IF EXISTS "monthly_plans_contador_read" ON monthly_plans;

CREATE POLICY "monthly_plans_admin_all" ON monthly_plans
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "monthly_plans_operador_read" ON monthly_plans
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'operador');

CREATE POLICY "monthly_plans_contador_read" ON monthly_plans
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'contador');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. cashier_shifts
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "shifts_admin_all"          ON cashier_shifts;
DROP POLICY IF EXISTS "shifts_operador_open_own"  ON cashier_shifts;
DROP POLICY IF EXISTS "shifts_operador_close_own" ON cashier_shifts;
DROP POLICY IF EXISTS "shifts_operador_read_own"  ON cashier_shifts;
DROP POLICY IF EXISTS "shifts_contador_read"      ON cashier_shifts;

CREATE POLICY "shifts_admin_all" ON cashier_shifts
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "shifts_operador_open_own" ON cashier_shifts
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'operador' AND user_id = auth.uid());

CREATE POLICY "shifts_operador_close_own" ON cashier_shifts
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'operador' AND user_id = auth.uid() AND status = 'open')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'operador' AND user_id = auth.uid());

CREATE POLICY "shifts_operador_read_own" ON cashier_shifts
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'operador' AND user_id = auth.uid());

CREATE POLICY "shifts_contador_read" ON cashier_shifts
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'contador');

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. parking_sessions
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sessions_admin_all"                  ON parking_sessions;
DROP POLICY IF EXISTS "sessions_operador_insert_own_entry"  ON parking_sessions;
DROP POLICY IF EXISTS "sessions_operador_update_exit"       ON parking_sessions;
DROP POLICY IF EXISTS "sessions_operador_read_own_today"    ON parking_sessions;
DROP POLICY IF EXISTS "sessions_contador_read_all"          ON parking_sessions;

CREATE POLICY "sessions_admin_all" ON parking_sessions
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "sessions_operador_insert_own_entry" ON parking_sessions
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'operador' AND entry_user_id = auth.uid());

CREATE POLICY "sessions_operador_update_exit" ON parking_sessions
  FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'user_role') = 'operador'
    AND (exit_user_id = auth.uid() OR exit_user_id IS NULL)
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'operador'
    AND exit_user_id = auth.uid()
  );

CREATE POLICY "sessions_operador_read_own_today" ON parking_sessions
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'user_role') = 'operador'
    AND entry_user_id = auth.uid()
    AND DATE(entry_at AT TIME ZONE 'America/Bogota') = DATE(now() AT TIME ZONE 'America/Bogota')
  );

CREATE POLICY "sessions_contador_read_all" ON parking_sessions
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'contador');

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. invoices
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invoices_admin_all"    ON invoices;
DROP POLICY IF EXISTS "invoices_contador_read" ON invoices;

CREATE POLICY "invoices_admin_all" ON invoices
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "invoices_contador_read" ON invoices
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'contador');

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. invoice_lines
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invoice_lines_admin_all"    ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_contador_read" ON invoice_lines;

CREATE POLICY "invoice_lines_admin_all" ON invoice_lines
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "invoice_lines_contador_read" ON invoice_lines
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'contador');

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. payments
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "payments_admin_all"                ON payments;
DROP POLICY IF EXISTS "payments_operador_insert_own_shift" ON payments;
DROP POLICY IF EXISTS "payments_operador_read_own_shift"  ON payments;
DROP POLICY IF EXISTS "payments_contador_read"            ON payments;

CREATE POLICY "payments_admin_all" ON payments
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "payments_operador_insert_own_shift" ON payments
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'operador'
    AND EXISTS (
      SELECT 1 FROM cashier_shifts
      WHERE id = cashier_shift_id
        AND user_id = auth.uid()
        AND status = 'open'
    )
  );

CREATE POLICY "payments_operador_read_own_shift" ON payments
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'user_role') = 'operador'
    AND EXISTS (
      SELECT 1 FROM cashier_shifts cs
      WHERE cs.id = payments.cashier_shift_id
        AND cs.user_id = auth.uid()
    )
  );

CREATE POLICY "payments_contador_read" ON payments
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'contador');

COMMIT;
