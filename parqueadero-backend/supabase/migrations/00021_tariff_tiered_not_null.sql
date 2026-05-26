-- ──────────────────────────────────────────────────────────────────────────
-- 00021 — Constraints NOT NULL sobre los 3 fields tiered para parking.
--
-- Después de S4 (UI escribe los 3 fields siempre) y 00019 (backfill rows
-- existentes), todas las tarifas de parking (unit != 'mensualidad') tienen
-- per_minute_cents, per_hour_cents, plena_cents NOT NULL.
--
-- Esta migration formaliza esa invariante en la BD con una CHECK constraint
-- conditional (NOT NULL solo cuando unit != 'mensualidad'). Las tarifas de
-- mensualidad siguen aceptando los 3 fields en NULL (no aplican).
--
-- Antes de aplicar, validamos que NO haya filas que la nueva constraint
-- rechazaría. Si las hay, la migration falla con un mensaje accionable.
-- ──────────────────────────────────────────────────────────────────────────

-- Pre-check: asegurar que la nueva constraint no rechazará rows existentes.
DO $$
DECLARE
  incompletas INT;
BEGIN
  SELECT COUNT(*) INTO incompletas
  FROM tariffs
  WHERE unit <> 'mensualidad'
    AND _deleted = false
    AND (per_minute_cents IS NULL
         OR per_hour_cents IS NULL
         OR plena_cents IS NULL);

  IF incompletas > 0 THEN
    RAISE EXCEPTION
      'Migration 00021: hay % tarifa(s) de parking con per_minute/per_hour/plena en NULL. '
      'Editalas desde /tariffs o corre 00020 antes para asegurar el backfill.',
      incompletas;
  END IF;
END
$$;

ALTER TABLE tariffs
  ADD CONSTRAINT tariffs_parking_requires_tiered
    CHECK (
      unit = 'mensualidad'
      OR (per_minute_cents IS NOT NULL
          AND per_hour_cents IS NOT NULL
          AND plena_cents   IS NOT NULL)
    );

COMMENT ON CONSTRAINT tariffs_parking_requires_tiered ON tariffs IS
  'Para parking (unit != mensualidad) los 3 fields tiered son obligatorios. Mensualidad los acepta NULL.';
