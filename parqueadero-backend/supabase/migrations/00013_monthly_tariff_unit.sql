-- Migration 00015: agregar 'mensualidad' como unidad válida en tariffs.
--
-- Contexto: las mensualidades son cobradas con su propia tarifa por tipo
-- de vehículo. En vez de crear una tabla nueva, reutilizamos `tariffs`
-- agregando un valor `unit='mensualidad'`. El `value_cents` representa
-- el precio del plan mensual completo. Los campos `grace_minutes` y
-- `daily_cap_cents` no aplican (se dejan en 0 / un valor alto irrelevante).
--
-- El use case `GetActiveMonthlyTariffUseCase` filtra `unit='mensualidad'`;
-- el resto del código de parking sigue filtrando los otros units para no
-- mezclar.

ALTER TABLE tariffs DROP CONSTRAINT IF EXISTS tariffs_unit_check;
ALTER TABLE tariffs
  ADD CONSTRAINT tariffs_unit_check
  CHECK (unit IN ('minuto', 'hora', 'fraccion', 'dia', 'mensualidad'));

-- Seed de tarifas mensuales por tipo de vehículo. Valores son defaults
-- razonables; el admin los ajusta desde /tariffs.
INSERT INTO tariffs (name, vehicle_type, unit, value_cents, grace_minutes, daily_cap_cents, is_active)
VALUES
  ('Mensualidad carro',     'carro',     'mensualidad', 15000000, 0, 15000000, true),
  ('Mensualidad moto',      'moto',      'mensualidad',  8000000, 0,  8000000, true),
  ('Mensualidad bicicleta', 'bicicleta', 'mensualidad',  3000000, 0,  3000000, true)
ON CONFLICT DO NOTHING;
