-- Migration 00037: operador lee todo el histórico de parking_sessions y payments
-- para la sección de Reportes.
-- Fecha: 2026-07-29
--
-- Regla de negocio: Reportes (revenue-by-period, sessions-by-type,
-- operator-performance, export-csv) se habilita para los 3 roles (admin,
-- contador, operador). Las vistas v_revenue_daily, v_sessions_by_type y
-- v_operator_performance no tienen RLS propio: heredan la de las tablas base
-- (parking_sessions, payments). Hoy operador solo puede leer su turno actual
-- (sessions_operador_read_own_today) y las sesiones que él cerró
-- (sessions_operador_read_own_exits) → los reportes le saldrían vacíos o
-- incompletos fuera de su turno/fecha.
--
-- Estas policies son ADITIVAS: Postgres combina múltiples policies SELECT del
-- mismo rol con OR, así que no reemplazan ni afectan las existentes (turno
-- actual, salidas propias, caja global). El uso operativo diario no cambia.

BEGIN;

CREATE POLICY sessions_operador_read_reports ON public.parking_sessions
  FOR SELECT
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'operador');

CREATE POLICY payments_operador_read_reports ON public.payments
  FOR SELECT
  USING (((SELECT auth.jwt()) ->> 'user_role') = 'operador');

COMMENT ON POLICY sessions_operador_read_reports ON public.parking_sessions IS
  'Operador lee todo el histórico de sesiones para la sección de Reportes (2026-07-29). Aditiva a sessions_operador_read_own_today y sessions_operador_read_own_exits.';
COMMENT ON POLICY payments_operador_read_reports ON public.payments IS
  'Operador lee todo el histórico de pagos para la sección de Reportes (2026-07-29). Aditiva a payments_operador_read_own_shift.';

COMMIT;
