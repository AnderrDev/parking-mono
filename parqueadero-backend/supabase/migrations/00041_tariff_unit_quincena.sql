-- ──────────────────────────────────────────────────────────────────────────
-- 00041 — Unidad de tarifa `quincena` (plan prepagado de 15 días).
--
-- El parqueadero empieza a vender planes de 15 días además del mensual. Un
-- plan de quincena NO es una fila distinta en `monthly_plans`: la duración
-- ya la expresan `start_date` / `end_date`, así que la tabla no cambia. Lo
-- único que falta es poder configurarle un PRECIO propio por tipo de
-- vehículo, y los precios viven en `tariffs`.
--
-- Se reutiliza `tariffs` con una unidad nueva, igual que hizo 00013 con
-- `mensualidad`: `value_cents` es el precio del periodo completo y los
-- campos de tiered pricing (per_minute/per_hour/plena) no aplican.
--
-- OJO al integrar: varias consultas de parqueo seleccionaban la tarifa de
-- rotación con `unit != 'mensualidad'`. Con `quincena` esa exclusión se
-- quedó corta y un plan podía colarse como tarifa por hora. En el front el
-- criterio pasó a `unit NOT IN ('mensualidad','quincena')` mediante
-- `PLAN_TARIFF_UNITS` (tariff.entity.ts). No hay consulta equivalente en
-- SQL del lado del servidor.
--
-- No se siembran precios: los define el negocio desde /tariffs.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.tariffs DROP CONSTRAINT IF EXISTS tariffs_unit_check;

ALTER TABLE public.tariffs
  ADD CONSTRAINT tariffs_unit_check
  CHECK (unit IN ('minuto', 'hora', 'fraccion', 'dia', 'mensualidad', 'quincena'));

COMMENT ON COLUMN public.tariffs.unit IS
  'Unidad de cobro. minuto/hora/fraccion/dia = rotación (cobro por tiempo). mensualidad/quincena = plan prepagado, donde value_cents es el precio del periodo completo.';

COMMIT;
