-- 00030 — Permitir que el usuario general/operador administre tarifas.
--
-- El despliegue operativo actual usa un único usuario general con rol
-- `operador`. Ese usuario debe poder ajustar tarifas desde el frontend.

DROP POLICY IF EXISTS tariffs_admin_all ON public.tariffs;
CREATE POLICY tariffs_admin_all ON public.tariffs
  FOR ALL
  USING (((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'operador'))
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'operador'));

DROP POLICY IF EXISTS customers_operador_insert ON public.customers;
CREATE POLICY customers_operador_insert ON public.customers
  FOR INSERT
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role') = 'operador');
