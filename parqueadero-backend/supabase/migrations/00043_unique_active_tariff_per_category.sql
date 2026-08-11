-- ──────────────────────────────────────────────────────────────────────────
-- 00043 — Unicidad de tarifa activa por categoría, con la quincena adentro.
--
-- Tercer punto (después de 00041 y 00042) donde la BD asumía que la única
-- unidad de plan era `mensualidad`. `uq_tariffs_active_parking_by_vehicle`
-- exigía una sola tarifa activa por tipo de vehículo entre todas las
-- unidades distintas de mensualidad, así que cargar la quincena de carro
-- chocaba contra la tarifa por hora de carro:
--
--   23505: duplicate key value violates unique constraint
--          "uq_tariffs_active_parking_by_vehicle"
--
-- La intención original sigue siendo válida y hay que conservarla: si
-- hubiera dos tarifas de rotación activas para el mismo tipo, el cobro
-- tomaría "cualquiera". Lo que cambia es la definición de categoría:
--
--   · rotación (minuto/hora/fraccion/dia): una activa por tipo de vehículo.
--   · planes: una activa por tipo de vehículo Y unidad, de modo que
--     mensualidad y quincena conviven pero no se duplican entre sí.
--
-- Esto refleja en la BD la misma regla que aplica `existsActiveSameCategory`
-- en el front, que hasta ahora era la única que la hacía cumplir.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

DROP INDEX IF EXISTS public.uq_tariffs_active_parking_by_vehicle;

CREATE UNIQUE INDEX uq_tariffs_active_parking_by_vehicle
  ON public.tariffs (vehicle_type)
  WHERE (is_active = true AND _deleted = false AND unit NOT IN ('mensualidad', 'quincena'));

CREATE UNIQUE INDEX uq_tariffs_active_plan_by_vehicle_unit
  ON public.tariffs (vehicle_type, unit)
  WHERE (is_active = true AND _deleted = false AND unit IN ('mensualidad', 'quincena'));

COMMIT;
