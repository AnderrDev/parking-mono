-- ──────────────────────────────────────────────────────────────────────────
-- 00045 — Las vistas pasan a respetar el rol de quien consulta.
--
-- Cierra el hallazgo que quedó abierto en 00039. Allí se quitó la lectura
-- ANÓNIMA de las cuatro vistas, que era lo urgente. Pero seguían siendo
-- `security_definer` (el modo por defecto): resuelven los permisos como su
-- dueño `postgres`, que tiene BYPASSRLS, así que las policies de las tablas
-- base nunca se evaluaban. Consecuencia: cualquier usuario con sesión
-- iniciada leía TODO a través de ellas — un operador podía sacar el
-- `v_audit_log` completo, que a nivel de tabla es solo para admin y contador.
--
-- Con `security_invoker = on` la vista evalúa las policies del que consulta,
-- que es la única forma de que el rol importe: PostgREST usa un único rol de
-- Postgres (`authenticated`) para todos los usuarios logueados, así que la
-- diferencia entre admin, contador y operador solo existe en las policies.
--
-- Antes de activarlo hay que darle al operador lo que sus reportes necesitan,
-- o las vistas se le vacían. Se midió qué ve hoy cada rol de las tablas base:
--
--   rol       pagos  turnos  usuarios  sesiones  auditoría
--   admin      163      36        2       165       586
--   contador   163      36        2       165       586
--   operador   163      36        1       165         0
--
-- El operador ya lee pagos, turnos y sesiones (00031/00037). Lo único que le
-- falta es la lista de usuarios: las tres vistas de reportes hacen JOIN con
-- `users` para resolver el nombre del operador, y al ver solo su propia fila
-- ese INNER JOIN le borraría del reporte todo turno ajeno. Y la auditoría en
-- 0 es justamente el comportamiento que se busca.
--
-- Ese mismo permiso arregla de paso otro hallazgo: `listShifts` en el front
-- pide `users!inner(nombre)`, así que al operador se le escondían los turnos
-- abiertos por otra persona.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- El operador ve la lista de usuarios activos: la necesita para resolver
-- nombres en reportes y cierres. No incluye a los desactivados.
DROP POLICY IF EXISTS users_operador_read_active ON public.users;
CREATE POLICY users_operador_read_active ON public.users
  FOR SELECT
  USING (
    ((SELECT auth.jwt()) ->> 'user_role') = 'operador'
    AND is_active = true
  );

ALTER VIEW public.v_revenue_daily        SET (security_invoker = on);
ALTER VIEW public.v_sessions_by_type     SET (security_invoker = on);
ALTER VIEW public.v_operator_performance SET (security_invoker = on);
ALTER VIEW public.v_audit_log            SET (security_invoker = on);

COMMIT;
