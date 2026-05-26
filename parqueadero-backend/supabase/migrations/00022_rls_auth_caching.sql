-- ──────────────────────────────────────────────────────────────────────────
-- 00022 — RLS auth caching (perf)
--
-- Postgres re-evalúa `auth.jwt()` y `auth.uid()` POR FILA cuando aparecen
-- directos en USING/WITH CHECK. Con 1000 sesiones eso son 1000 llamadas
-- redundantes. Envolviendo la función en (SELECT …) Postgres la promueve
-- a un InitPlan: se ejecuta UNA vez por query y se cachea.
--
-- Impacto esperado: 10–100× speedup en queries que retornan muchas filas
-- (reportes, listado de sesiones admin, audit_log).
--
-- Sin cambios funcionales: el resultado lógico de cada policy es idéntico.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- =========================================================================
-- app_settings
-- =========================================================================
DROP POLICY IF EXISTS p_app_settings_select ON public.app_settings;
CREATE POLICY p_app_settings_select ON public.app_settings
  FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS p_app_settings_write ON public.app_settings;
CREATE POLICY p_app_settings_write ON public.app_settings
  FOR ALL
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'admin')
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'admin');

-- =========================================================================
-- audit_log
-- =========================================================================
DROP POLICY IF EXISTS audit_log_admin_contador_read ON public.audit_log;
CREATE POLICY audit_log_admin_contador_read ON public.audit_log
  FOR SELECT
  USING (((SELECT auth.jwt()) ->> 'user_role') = ANY (ARRAY['admin','contador']));

-- =========================================================================
-- cash_withdrawals
-- =========================================================================
DROP POLICY IF EXISTS p_cash_withdrawals_insert ON public.cash_withdrawals;
CREATE POLICY p_cash_withdrawals_insert ON public.cash_withdrawals
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM cashier_shifts s
      WHERE s.id = cash_withdrawals.shift_id
        AND s.user_id = (SELECT auth.uid())
        AND s.status = 'open'
        AND s._deleted = false
    )
  );

DROP POLICY IF EXISTS p_cash_withdrawals_select ON public.cash_withdrawals;
CREATE POLICY p_cash_withdrawals_select ON public.cash_withdrawals
  FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR ((SELECT auth.jwt()) ->> 'user_role') = ANY (ARRAY['admin','contador'])
  );

DROP POLICY IF EXISTS p_cash_withdrawals_update ON public.cash_withdrawals;
CREATE POLICY p_cash_withdrawals_update ON public.cash_withdrawals
  FOR UPDATE
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'admin');

-- =========================================================================
-- cashier_shifts
-- =========================================================================
DROP POLICY IF EXISTS shifts_admin_all ON public.cashier_shifts;
CREATE POLICY shifts_admin_all ON public.cashier_shifts
  FOR ALL
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'admin')
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'admin');

DROP POLICY IF EXISTS shifts_contador_read ON public.cashier_shifts;
CREATE POLICY shifts_contador_read ON public.cashier_shifts
  FOR SELECT
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'contador');

DROP POLICY IF EXISTS shifts_operador_close_own ON public.cashier_shifts;
CREATE POLICY shifts_operador_close_own ON public.cashier_shifts
  FOR UPDATE
  USING (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND user_id = (SELECT auth.uid())
    AND status = 'open'
  )
  WITH CHECK (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS shifts_operador_open_own ON public.cashier_shifts;
CREATE POLICY shifts_operador_open_own ON public.cashier_shifts
  FOR INSERT
  WITH CHECK (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS shifts_operador_read_own ON public.cashier_shifts;
CREATE POLICY shifts_operador_read_own ON public.cashier_shifts
  FOR SELECT
  USING (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND user_id = (SELECT auth.uid())
  );

-- =========================================================================
-- customers
-- =========================================================================
DROP POLICY IF EXISTS customers_admin_all ON public.customers;
CREATE POLICY customers_admin_all ON public.customers
  FOR ALL
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'admin')
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'admin');

DROP POLICY IF EXISTS customers_contador_read ON public.customers;
CREATE POLICY customers_contador_read ON public.customers
  FOR SELECT
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'contador');

DROP POLICY IF EXISTS customers_operador_read ON public.customers;
CREATE POLICY customers_operador_read ON public.customers
  FOR SELECT
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'operador');

-- =========================================================================
-- invoice_lines
-- =========================================================================
DROP POLICY IF EXISTS invoice_lines_admin_all ON public.invoice_lines;
CREATE POLICY invoice_lines_admin_all ON public.invoice_lines
  FOR ALL
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'admin')
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'admin');

DROP POLICY IF EXISTS invoice_lines_contador_read ON public.invoice_lines;
CREATE POLICY invoice_lines_contador_read ON public.invoice_lines
  FOR SELECT
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'contador');

-- =========================================================================
-- invoices
-- =========================================================================
DROP POLICY IF EXISTS invoices_admin_all ON public.invoices;
CREATE POLICY invoices_admin_all ON public.invoices
  FOR ALL
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'admin')
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'admin');

DROP POLICY IF EXISTS invoices_contador_read ON public.invoices;
CREATE POLICY invoices_contador_read ON public.invoices
  FOR SELECT
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'contador');

-- =========================================================================
-- monthly_plans
-- =========================================================================
DROP POLICY IF EXISTS monthly_plans_admin_all ON public.monthly_plans;
CREATE POLICY monthly_plans_admin_all ON public.monthly_plans
  FOR ALL
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'admin')
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'admin');

DROP POLICY IF EXISTS monthly_plans_contador_read ON public.monthly_plans;
CREATE POLICY monthly_plans_contador_read ON public.monthly_plans
  FOR SELECT
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'contador');

DROP POLICY IF EXISTS monthly_plans_operador_read ON public.monthly_plans;
CREATE POLICY monthly_plans_operador_read ON public.monthly_plans
  FOR SELECT
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'operador');

-- =========================================================================
-- parking_sessions
-- =========================================================================
DROP POLICY IF EXISTS sessions_admin_all ON public.parking_sessions;
CREATE POLICY sessions_admin_all ON public.parking_sessions
  FOR ALL
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'admin')
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'admin');

DROP POLICY IF EXISTS sessions_contador_read_all ON public.parking_sessions;
CREATE POLICY sessions_contador_read_all ON public.parking_sessions
  FOR SELECT
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'contador');

DROP POLICY IF EXISTS sessions_operador_insert_own_entry ON public.parking_sessions;
CREATE POLICY sessions_operador_insert_own_entry ON public.parking_sessions
  FOR INSERT
  WITH CHECK (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND entry_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS sessions_operador_read_own_today ON public.parking_sessions;
CREATE POLICY sessions_operador_read_own_today ON public.parking_sessions
  FOR SELECT
  USING (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND entry_user_id = (SELECT auth.uid())
    AND date(entry_at AT TIME ZONE 'America/Bogota') = date(now() AT TIME ZONE 'America/Bogota')
  );

DROP POLICY IF EXISTS sessions_operador_update_exit ON public.parking_sessions;
CREATE POLICY sessions_operador_update_exit ON public.parking_sessions
  FOR UPDATE
  USING (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND (exit_user_id = (SELECT auth.uid()) OR exit_user_id IS NULL)
  )
  WITH CHECK (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND exit_user_id = (SELECT auth.uid())
  );

-- =========================================================================
-- payments
-- =========================================================================
DROP POLICY IF EXISTS payments_admin_all ON public.payments;
CREATE POLICY payments_admin_all ON public.payments
  FOR ALL
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'admin')
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'admin');

DROP POLICY IF EXISTS payments_contador_read ON public.payments;
CREATE POLICY payments_contador_read ON public.payments
  FOR SELECT
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'contador');

DROP POLICY IF EXISTS payments_operador_insert_own_shift ON public.payments;
CREATE POLICY payments_operador_insert_own_shift ON public.payments
  FOR INSERT
  WITH CHECK (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND EXISTS (
      SELECT 1 FROM cashier_shifts
      WHERE cashier_shifts.id = payments.cashier_shift_id
        AND cashier_shifts.user_id = (SELECT auth.uid())
        AND cashier_shifts.status = 'open'
    )
  );

DROP POLICY IF EXISTS payments_operador_read_own_shift ON public.payments;
CREATE POLICY payments_operador_read_own_shift ON public.payments
  FOR SELECT
  USING (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND EXISTS (
      SELECT 1 FROM cashier_shifts cs
      WHERE cs.id = payments.cashier_shift_id
        AND cs.user_id = (SELECT auth.uid())
    )
  );

-- =========================================================================
-- tariffs
-- =========================================================================
DROP POLICY IF EXISTS tariffs_admin_all ON public.tariffs;
CREATE POLICY tariffs_admin_all ON public.tariffs
  FOR ALL
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'admin')
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'admin');

-- (tariffs_authenticated_read_active no usa auth.jwt — sin cambio)

-- =========================================================================
-- users
-- =========================================================================
DROP POLICY IF EXISTS users_admin_all ON public.users;
CREATE POLICY users_admin_all ON public.users
  FOR ALL
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'admin')
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'admin');

DROP POLICY IF EXISTS users_contador_read_active ON public.users;
CREATE POLICY users_contador_read_active ON public.users
  FOR SELECT
  USING (
    ((SELECT auth.jwt()) ->> 'user_role') = 'contador'
    AND is_active = true
  );

DROP POLICY IF EXISTS users_operador_read_own ON public.users;
CREATE POLICY users_operador_read_own ON public.users
  FOR SELECT
  USING (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND id = (SELECT auth.uid())
  );

-- =========================================================================
-- vehicles
-- =========================================================================
DROP POLICY IF EXISTS vehicles_admin_all ON public.vehicles;
CREATE POLICY vehicles_admin_all ON public.vehicles
  FOR ALL
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'admin')
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'admin');

DROP POLICY IF EXISTS vehicles_authenticated_read ON public.vehicles;
CREATE POLICY vehicles_authenticated_read ON public.vehicles
  FOR SELECT
  USING (((SELECT auth.jwt()) ->> 'user_role') = ANY (ARRAY['admin','operador','contador']));

COMMIT;
