-- Migration 00003: RLS policies por tabla y rol
-- Spec: specs/rls-policies.spec.md
--
-- Patrón:
--   - ENABLE + FORCE RLS en cada tabla con datos de cliente.
--   - admin: FOR ALL con USING + WITH CHECK = ((auth.jwt() ->> 'role') = 'admin').
--   - operador / contador: policies específicas por acción.
--   - Sin policy = DENY por default.
-- Dependencia: el claim 'role' viene del JWT custom hook que se implementa en Fase 3.

BEGIN;

-- ============================================================================
-- users
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY "users_admin_all" ON users
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "users_operador_read_own" ON users
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'operador' AND id = auth.uid());

CREATE POLICY "users_contador_read_active" ON users
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'contador' AND is_active = TRUE);

-- Nota: la spec permite al operador editar su 'nombre'. Postgres RLS no soporta
-- column-level WITH CHECK, así que esa edición se enforce en Fase 3 vía trigger
-- BEFORE UPDATE que verifica que (role,is_active,email) no cambien para no-admin.

-- ============================================================================
-- customers
-- ============================================================================
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;

CREATE POLICY "customers_admin_all" ON customers
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "customers_operador_read" ON customers
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'operador');

CREATE POLICY "customers_contador_read" ON customers
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'contador');

-- ============================================================================
-- vehicles
-- ============================================================================
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles FORCE ROW LEVEL SECURITY;

CREATE POLICY "vehicles_admin_all" ON vehicles
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "vehicles_authenticated_read" ON vehicles
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'operador', 'contador'));

-- ============================================================================
-- tariffs
-- ============================================================================
ALTER TABLE tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tariffs FORCE ROW LEVEL SECURITY;

CREATE POLICY "tariffs_admin_all" ON tariffs
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "tariffs_authenticated_read_active" ON tariffs
  FOR SELECT TO authenticated
  USING (is_active = TRUE AND _deleted = FALSE);

-- ============================================================================
-- monthly_plans
-- ============================================================================
ALTER TABLE monthly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_plans FORCE ROW LEVEL SECURITY;

CREATE POLICY "monthly_plans_admin_all" ON monthly_plans
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "monthly_plans_operador_read" ON monthly_plans
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'operador');

CREATE POLICY "monthly_plans_contador_read" ON monthly_plans
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'contador');

-- ============================================================================
-- cashier_shifts
-- ============================================================================
ALTER TABLE cashier_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashier_shifts FORCE ROW LEVEL SECURITY;

CREATE POLICY "shifts_admin_all" ON cashier_shifts
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "shifts_operador_open_own" ON cashier_shifts
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'role') = 'operador' AND user_id = auth.uid());

CREATE POLICY "shifts_operador_close_own" ON cashier_shifts
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'role') = 'operador' AND user_id = auth.uid() AND status = 'open')
  WITH CHECK ((auth.jwt() ->> 'role') = 'operador' AND user_id = auth.uid());

CREATE POLICY "shifts_operador_read_own" ON cashier_shifts
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'operador' AND user_id = auth.uid());

CREATE POLICY "shifts_contador_read" ON cashier_shifts
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'contador');

-- ============================================================================
-- parking_sessions
-- ============================================================================
ALTER TABLE parking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY "sessions_admin_all" ON parking_sessions
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "sessions_operador_insert_own_entry" ON parking_sessions
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'role') = 'operador' AND entry_user_id = auth.uid());

CREATE POLICY "sessions_operador_update_exit" ON parking_sessions
  FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'operador'
    AND (exit_user_id = auth.uid() OR exit_user_id IS NULL)
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'operador'
    AND exit_user_id = auth.uid()
  );

CREATE POLICY "sessions_operador_read_own_today" ON parking_sessions
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'operador'
    AND entry_user_id = auth.uid()
    AND DATE(entry_at AT TIME ZONE 'America/Bogota') = DATE(now() AT TIME ZONE 'America/Bogota')
  );

CREATE POLICY "sessions_contador_read_all" ON parking_sessions
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'contador');

-- ============================================================================
-- invoices (cliente NO inserta directo; siempre vía Edge Function service_role)
-- ============================================================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY "invoices_admin_all" ON invoices
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "invoices_contador_read" ON invoices
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'contador');

-- ============================================================================
-- invoice_lines (mismo control que invoices)
-- ============================================================================
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY "invoice_lines_admin_all" ON invoice_lines
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "invoice_lines_contador_read" ON invoice_lines
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'contador');

-- ============================================================================
-- payments
-- ============================================================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;

CREATE POLICY "payments_admin_all" ON payments
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "payments_operador_insert_own_shift" ON payments
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'operador'
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
    (auth.jwt() ->> 'role') = 'operador'
    AND EXISTS (
      SELECT 1 FROM cashier_shifts cs
      WHERE cs.id = payments.cashier_shift_id
        AND cs.user_id = auth.uid()
    )
  );

CREATE POLICY "payments_contador_read" ON payments
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'contador');

COMMIT;
