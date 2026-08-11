-- ──────────────────────────────────────────────────────────────────────────
-- 00042 — `tariffs_parking_requires_tiered` también debe eximir a la quincena.
--
-- 00041 habilitó `unit = 'quincena'`, pero insertar una tarifa de quincena
-- seguía fallando con:
--
--   23514: new row for relation "tariffs" violates check constraint
--          "tariffs_parking_requires_tiered"
--
-- La constraint (de 00021) exige per_minute/per_hour/plena salvo cuando
-- `unit = 'mensualidad'`. Es el mismo supuesto que había en el front:
-- "todo lo que no es mensualidad se cobra por tiempo". Un plan de quincena
-- es precio plano y no tiene esos campos, así que caía del lado de rotación.
--
-- Se generaliza a la lista de unidades de plan. Cualquier unidad de plan
-- nueva tendrá que agregarse aquí y en `PLAN_TARIFF_UNITS` del front.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.tariffs DROP CONSTRAINT IF EXISTS tariffs_parking_requires_tiered;

ALTER TABLE public.tariffs
  ADD CONSTRAINT tariffs_parking_requires_tiered
  CHECK (
    unit IN ('mensualidad', 'quincena')
    OR (
      per_minute_cents IS NOT NULL
      AND per_hour_cents IS NOT NULL
      AND plena_cents IS NOT NULL
    )
  );

COMMENT ON CONSTRAINT tariffs_parking_requires_tiered ON public.tariffs IS
  'Las tarifas de rotación exigen los tres valores de tiered pricing. Los planes prepagados (mensualidad, quincena) van con precio plano en value_cents.';

COMMIT;
