-- ──────────────────────────────────────────────────────────────────────────
-- 00046 — Índice sobre `payments.gateway_ref`.
--
-- `gateway_ref = 'monthly_plan:<id>'` es el único vínculo entre un pago y la
-- mensualidad que lo originó (`payments` no tiene FK al plan; ver 00040), y
-- ya lo consultan tres caminos:
--
--   · `cancel_monthly_plan` y la anulación de pagos (00044), server-side.
--   · La reimpresión del comprobante de mensualidad desde el front, que
--     necesita el método de pago real.
--
-- Sin índice cada una de esas consultas es un seq scan sobre `payments`, la
-- tabla que más crece con el volumen de parqueo.
--
-- Índice PARCIAL: la enorme mayoría de los pagos son salidas de parqueo con
-- `gateway_ref` NULL y no aportan nada al índice.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE INDEX IF NOT EXISTS idx_payments_gateway_ref
  ON public.payments (gateway_ref)
  WHERE gateway_ref IS NOT NULL;

COMMENT ON INDEX public.idx_payments_gateway_ref IS
  'Resuelve el vínculo pago ↔ mensualidad (gateway_ref = monthly_plan:<id>) sin recorrer toda la tabla.';

COMMIT;
