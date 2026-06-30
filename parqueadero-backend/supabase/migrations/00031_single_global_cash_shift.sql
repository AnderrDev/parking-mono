-- Migration 00031: caja abierta global para parqueadero de un solo punto.
-- Fecha: 2026-06-30
--
-- Regla de negocio:
-- - Solo puede existir una caja abierta en todo el parqueadero.
-- - Cualquier usuario operativo autenticado puede registrar pagos y movimientos
--   contra la caja abierta visible.
-- - El historial conserva user_id como usuario que abrio/cerro/registra.

BEGIN;

DROP INDEX IF EXISTS uq_shifts_open_per_user;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cashier_shifts_single_open
  ON public.cashier_shifts ((status))
  WHERE status = 'open' AND _deleted = FALSE;

ALTER TABLE public.cash_withdrawals
  ADD COLUMN IF NOT EXISTS movement_type TEXT NOT NULL DEFAULT 'out'
  CHECK (movement_type IN ('in', 'out'));

COMMENT ON COLUMN public.cash_withdrawals.movement_type
  IS 'Tipo de movimiento manual de caja: in suma efectivo esperado, out lo resta.';

DROP POLICY IF EXISTS shifts_operador_read_own ON public.cashier_shifts;
CREATE POLICY shifts_operador_read_own ON public.cashier_shifts
  FOR SELECT
  USING (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND (
      user_id = (SELECT auth.uid())
      OR status = 'open'
    )
  );

DROP POLICY IF EXISTS shifts_operador_close_own ON public.cashier_shifts;
CREATE POLICY shifts_operador_close_own ON public.cashier_shifts
  FOR UPDATE
  USING (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND status = 'open'
  )
  WITH CHECK (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
  );

DROP POLICY IF EXISTS p_cash_withdrawals_insert ON public.cash_withdrawals;
CREATE POLICY p_cash_withdrawals_insert ON public.cash_withdrawals
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.cashier_shifts s
      WHERE s.id = cash_withdrawals.shift_id
        AND s.status = 'open'
        AND s._deleted = FALSE
    )
  );

DROP POLICY IF EXISTS p_cash_withdrawals_select ON public.cash_withdrawals;
CREATE POLICY p_cash_withdrawals_select ON public.cash_withdrawals
  FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'contador')
    OR EXISTS (
      SELECT 1
      FROM public.cashier_shifts s
      WHERE s.id = cash_withdrawals.shift_id
        AND s.status = 'open'
    )
  );

DROP POLICY IF EXISTS payments_operador_insert_own_shift ON public.payments;
CREATE POLICY payments_operador_insert_own_shift ON public.payments
  FOR INSERT
  WITH CHECK (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND EXISTS (
      SELECT 1
      FROM public.cashier_shifts
      WHERE cashier_shifts.id = payments.cashier_shift_id
        AND cashier_shifts.status = 'open'
        AND cashier_shifts._deleted = FALSE
    )
  );

DROP POLICY IF EXISTS payments_operador_read_own_shift ON public.payments;
CREATE POLICY payments_operador_read_own_shift ON public.payments
  FOR SELECT
  USING (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND EXISTS (
      SELECT 1
      FROM public.cashier_shifts cs
      WHERE cs.id = payments.cashier_shift_id
        AND (
          cs.user_id = (SELECT auth.uid())
          OR cs.status = 'open'
        )
    )
  );

COMMIT;
