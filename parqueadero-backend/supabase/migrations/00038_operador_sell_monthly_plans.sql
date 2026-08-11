-- ──────────────────────────────────────────────────────────────────────────
-- 00038 — El operador puede vender mensualidades.
--
-- Problema: la pantalla /monthly-plans está detrás de `authGuard` (sin gate
-- de rol), así que el operador entra, llena el formulario y al guardar el
-- INSERT muere con 42501 "new row violates row-level security policy".
-- La UI lo traduce a "Error del servidor. Intenta más tarde." y la venta
-- nunca queda registrada.
--
-- Hasta 00037 `monthly_plans` y `customers` solo tenían política de escritura
-- para admin. Pero vender una mensualidad es una operación de caja: ocurre en
-- el mostrador, contra el turno abierto del operador, y el ingreso ya se
-- registra en `payments` vía `payments_operador_insert_own_shift`.
--
-- Se habilita al operador:
--   · monthly_plans: INSERT (vender) + UPDATE (renovar vigencia / cancelar,
--     que es un soft-delete vía `_deleted = true` desde la misma pantalla).
--   · customers: INSERT, porque el diálogo de venta crea el cliente inline
--     cuando la placa es de alguien que aún no está en la base.
--
-- No se habilita DELETE físico en ninguna de las dos: el borrado siempre es
-- lógico y queda en `audit_log`.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- =========================================================================
-- monthly_plans
-- =========================================================================
DROP POLICY IF EXISTS monthly_plans_operador_insert ON public.monthly_plans;
CREATE POLICY monthly_plans_operador_insert ON public.monthly_plans
  FOR INSERT
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'operador');

DROP POLICY IF EXISTS monthly_plans_operador_update ON public.monthly_plans;
CREATE POLICY monthly_plans_operador_update ON public.monthly_plans
  FOR UPDATE
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'operador')
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'operador');

-- =========================================================================
-- customers
-- =========================================================================
DROP POLICY IF EXISTS customers_operador_insert ON public.customers;
CREATE POLICY customers_operador_insert ON public.customers
  FOR INSERT
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'operador');

COMMIT;
