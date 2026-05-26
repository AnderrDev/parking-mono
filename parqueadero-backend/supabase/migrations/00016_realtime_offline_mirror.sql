-- 00019_realtime_offline_mirror.sql
-- Fase 8 - Sprint 1: habilita Supabase Realtime para los 5 catálogos del
-- mirror offline operador-only.

ALTER TABLE tariffs        REPLICA IDENTITY FULL;
ALTER TABLE monthly_plans  REPLICA IDENTITY FULL;
ALTER TABLE customers      REPLICA IDENTITY FULL;
ALTER TABLE vehicles       REPLICA IDENTITY FULL;
ALTER TABLE app_settings   REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tariffs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE monthly_plans;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE customers;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE vehicles;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE tariffs IS
  'Tarifas. Publicada en supabase_realtime para mirror offline (Fase 8).';
COMMENT ON TABLE monthly_plans IS
  'Planes mensuales. Publicada en supabase_realtime para mirror offline (Fase 8).';
COMMENT ON TABLE customers IS
  'Clientes. Publicada en supabase_realtime para mirror offline (Fase 8).';
COMMENT ON TABLE vehicles IS
  'Vehículos. Publicada en supabase_realtime para mirror offline (Fase 8).';
COMMENT ON TABLE app_settings IS
  'Configuración global key/value. Publicada en supabase_realtime para mirror offline (Fase 8).';
