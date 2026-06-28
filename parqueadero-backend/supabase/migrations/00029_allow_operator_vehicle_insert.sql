BEGIN;

-- Operators register vehicle entries from the parking dashboard. The entry flow
-- first creates the plate in vehicles, then creates the parking session.
DROP POLICY IF EXISTS vehicles_operador_insert ON public.vehicles;
CREATE POLICY vehicles_operador_insert ON public.vehicles
  FOR INSERT
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'operador');

COMMIT;
