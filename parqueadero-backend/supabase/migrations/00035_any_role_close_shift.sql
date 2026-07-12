-- Migration 00035: cualquier rol autenticado puede cerrar la caja abierta.
-- Fecha: 2026-07-11
--
-- Regla de negocio (2026-07-11): la caja es global (00031) y CUALQUIER usuario
-- autenticado (admin, operador, contador) puede cerrarla, sin importar quién
-- la abrió.
--
-- Además corrige la variante en cashier_shifts del bug 42501 arreglado en
-- 00034 para parking_sessions: el UPDATE de cierre (status → 'closed') exige
-- que la fila resultante siga siendo SELECT-visible para el rol. Con
-- shifts_operador_read_own (user_id = yo OR status='open'), cerrar una caja
-- abierta por OTRO usuario dejaba la fila fuera del conjunto visible y el
-- cierre fallaba con "new row violates row-level security policy".
--
-- Cambios:
--   - UPDATE: shifts_operador_close_own → shifts_operational_close_open
--     (admin/operador/contador pueden cerrar la caja abierta).
--   - SELECT: shifts_operador_read_own y shifts_contador_read →
--     shifts_operational_read (los tres roles leen todas las cajas).
--   - INSERT (abrir caja) queda igual: solo operador (y admin vía admin_all).

BEGIN;

-- UPDATE: cerrar la caja abierta, cualquier rol operativo.
DROP POLICY IF EXISTS shifts_operador_close_own ON public.cashier_shifts;
DROP POLICY IF EXISTS shifts_operational_close_open ON public.cashier_shifts;
CREATE POLICY shifts_operational_close_open ON public.cashier_shifts
  FOR UPDATE
  USING (
    ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'operador', 'contador')
    AND status = 'open'
  )
  WITH CHECK (
    ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'operador', 'contador')
  );

COMMENT ON POLICY shifts_operational_close_open ON public.cashier_shifts IS
  'Caja global: cualquier rol autenticado cierra la caja abierta, sin importar quién la abrió.';

-- SELECT: lectura de todas las cajas para los tres roles.
-- Requerido para que la fila cerrada siga siendo visible tras el UPDATE (42501).
DROP POLICY IF EXISTS shifts_operador_read_own ON public.cashier_shifts;
DROP POLICY IF EXISTS shifts_contador_read ON public.cashier_shifts;
DROP POLICY IF EXISTS shifts_operational_read ON public.cashier_shifts;
CREATE POLICY shifts_operational_read ON public.cashier_shifts
  FOR SELECT
  USING (
    ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'operador', 'contador')
  );

COMMENT ON POLICY shifts_operational_read ON public.cashier_shifts IS
  'Los tres roles leen todas las cajas. Garantiza visibilidad SELECT de la fila resultante del cierre (evita 42501).';

COMMIT;
