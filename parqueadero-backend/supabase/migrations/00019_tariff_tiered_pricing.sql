-- ──────────────────────────────────────────────────────────────────────────
-- 00019 — Tariff tiered pricing (Sprint S2 de feature tariff-tiered-pricing)
--
-- Reformamos `tariffs` para soportar 3 valores monetarios independientes
-- por tarifa de parking (no aplica a mensualidad). El cálculo nuevo
-- (ver `specs/tariffs-pricing.spec.md`) es MIN de los tres candidatos:
--
--   byMinute = duration × per_minute_cents
--   byHour   = ceil(duration / 60) × per_hour_cents
--   plena    = plena_cents             (tope absoluto)
--
-- Esta migration agrega las 3 columnas como NULLABLE + backfill seguro de
-- rows existentes. Las constraints NOT NULL se aplican en una migration
-- posterior (cuando la UI escriba los 3 fields desde el form, Sprint S4).
--
-- Las columnas legacy `value_cents` y `daily_cap_cents` quedan vigentes
-- en esta migration; siguen siendo NOT NULL y los use cases viejos siguen
-- escribiéndolas. Se eliminan en una migration futura tras validar que
-- ningún código las lee para parking (sí para mensualidad).
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Nuevas columnas (nullable inicial)
ALTER TABLE tariffs
  ADD COLUMN per_minute_cents BIGINT,
  ADD COLUMN per_hour_cents   BIGINT,
  ADD COLUMN plena_cents      BIGINT;

COMMENT ON COLUMN tariffs.per_minute_cents IS
  'Valor por minuto suelto (parking). NOT NULL en una migration futura cuando la UI lo escriba.';
COMMENT ON COLUMN tariffs.per_hour_cents IS
  'Valor por hora completa, se cobra ceil(min/60). NOT NULL en migration futura.';
COMMENT ON COLUMN tariffs.plena_cents IS
  'Tope absoluto por sesión (día). Reemplaza daily_cap_cents para parking. NOT NULL en migration futura.';

-- 2. Backfill seguro para tarifas de parking existentes.
--    Preservamos el cobro previo:
--      per_hour := value_cents          (asumimos value_cents = tarifa por hora)
--      per_minute := value_cents / 60    (proporcional, idéntico al cálculo viejo)
--      plena := daily_cap_cents
--    Mensualidad NO se toca (value_cents allí es el precio mensual).
UPDATE tariffs
SET per_hour_cents   = value_cents,
    per_minute_cents = GREATEST(1, value_cents / 60),  -- evita 0 si value_cents < 60
    plena_cents      = daily_cap_cents
WHERE unit <> 'mensualidad'
  AND _deleted = false;

-- 3. CHECK positivos (válidos solo cuando NOT NULL)
ALTER TABLE tariffs
  ADD CONSTRAINT tariffs_per_minute_positive
    CHECK (per_minute_cents IS NULL OR per_minute_cents > 0),
  ADD CONSTRAINT tariffs_per_hour_positive
    CHECK (per_hour_cents IS NULL OR per_hour_cents > 0),
  ADD CONSTRAINT tariffs_plena_positive
    CHECK (plena_cents IS NULL OR plena_cents > 0);

-- 4. CHECK cliente-friendly (C5, C6): la hora no más cara que 60 min sueltos,
--    la plena no más cara que 24h. Solo se evalúa cuando ambos lados están
--    seteados (i.e., no rompe rows nuevos con campos en NULL).
ALTER TABLE tariffs
  ADD CONSTRAINT tariffs_hour_le_60_minutes
    CHECK (
      per_hour_cents IS NULL
      OR per_minute_cents IS NULL
      OR per_hour_cents <= per_minute_cents * 60
    ),
  ADD CONSTRAINT tariffs_plena_le_24_hours
    CHECK (
      plena_cents IS NULL
      OR per_hour_cents IS NULL
      OR plena_cents <= per_hour_cents * 24
    );

-- 5. UNIQUE C7: una sola tarifa de parking activa por vehicle_type.
--    Excluye mensualidad (puede coexistir parking + mensualidad para el mismo tipo).
CREATE UNIQUE INDEX uq_tariffs_active_parking_by_vehicle
  ON tariffs (vehicle_type)
  WHERE is_active = true
    AND _deleted = false
    AND unit <> 'mensualidad';
