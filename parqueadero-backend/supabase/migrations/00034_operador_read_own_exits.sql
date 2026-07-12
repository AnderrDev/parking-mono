-- Migration 00034: operador puede leer las sesiones que él mismo cerró.
-- Fecha: 2026-07-11
--
-- Bug en producción (carro OCK216, entró 2026-07-10, salida 2026-07-11):
-- "new row violates row-level security policy for table parking_sessions".
--
-- Causa raíz: el UPDATE de salida (status → 'completed') lee la tabla
-- (WHERE id = ... y RETURNING), y Postgres exige que la fila RESULTANTE siga
-- siendo visible por alguna política SELECT del rol. Para el operador solo
-- existían:
--   - sessions_operador_read_own_today  → exige entry_at de HOY
--   - sessions_authenticated_read_active → exige status = 'active'
-- La fila cerrada de un carro que entró un día anterior no cumple ninguna,
-- así que el UPDATE era rechazado con 42501 aunque el WITH CHECK de la
-- política de UPDATE sí pasara. Las salidas del mismo día funcionaban porque
-- read_own_today cubría la fila resultante.
--
-- Fix: el operador ve las sesiones donde él figura como exit_user_id, sin
-- restricción de fecha. También cubre el caso de caja global (00031) donde
-- un operador saca un carro que ingresó otro operador.

BEGIN;

DROP POLICY IF EXISTS sessions_operador_read_own_exits ON public.parking_sessions;
CREATE POLICY sessions_operador_read_own_exits ON public.parking_sessions
  FOR SELECT
  USING (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND exit_user_id = (SELECT auth.uid())
  );

COMMENT ON POLICY sessions_operador_read_own_exits ON public.parking_sessions IS
  'El operador lee las sesiones que él cerró (cualquier fecha de entrada). Requerido para que el UPDATE de salida pase la visibilidad SELECT de la fila resultante (42501).';

COMMIT;
