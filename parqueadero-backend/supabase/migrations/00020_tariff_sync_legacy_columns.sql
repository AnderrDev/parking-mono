-- ──────────────────────────────────────────────────────────────────────────
-- 00020 — Sincroniza value_cents/daily_cap_cents con los 3 fields tiered.
--
-- Contexto: tras la feature tariff-tiered-pricing (00019), `value_cents` y
-- `daily_cap_cents` quedaron como columnas legacy. La UI nueva siempre escribe
-- los 3 fields tiered y deriva los legacy automáticamente desde S4, pero las
-- rows seedadas o editadas durante el período intermedio quedaron desfasadas
-- (en dev: $200 de diferencia en ambas tarifas).
--
-- Esta migration realinea los legacy para que `value_cents == per_hour_cents`
-- y `daily_cap_cents == plena_cents` cuando unit != 'mensualidad'. No toca
-- mensualidad (allí value_cents es el precio mensual real, no derivable).
--
-- Las columnas siguen vigentes (no se dropean en esta migration): mensualidad
-- las usa con semántica propia, y los specs de reporting todavía pueden
-- leerlas. Una migration futura puede eliminar los legacy una vez todos los
-- consumers migren a usar los 3 tiered.
-- ──────────────────────────────────────────────────────────────────────────

UPDATE tariffs
SET value_cents     = per_hour_cents,
    daily_cap_cents = plena_cents
WHERE unit <> 'mensualidad'
  AND _deleted = false
  AND (value_cents <> per_hour_cents OR daily_cap_cents <> plena_cents);

-- Verificación (no es DDL, no afecta schema_migrations).
-- Esperamos 0 rows desalineadas tras el UPDATE.
DO $$
DECLARE
  desfasadas INT;
BEGIN
  SELECT COUNT(*) INTO desfasadas
  FROM tariffs
  WHERE unit <> 'mensualidad'
    AND _deleted = false
    AND (value_cents <> per_hour_cents OR daily_cap_cents <> plena_cents);

  IF desfasadas > 0 THEN
    RAISE EXCEPTION 'Migration 00020: quedaron % filas con legacy desalineado', desfasadas;
  END IF;
END
$$;
