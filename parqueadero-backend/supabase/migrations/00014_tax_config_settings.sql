-- Migration 00014: configuración tributaria (régimen IVA, tasa, ICA)
-- Spec: parqueadero-backend/specs/tax-config.spec.md
-- Fecha: 2026-05-04
--
-- Establece la fuente de verdad para:
--  • régimen tributario del establecimiento
--  • si los precios al público incluyen IVA (true para parqueaderos B2C en CO)
--  • tarifa IVA y datos básicos para reporte ICA
--
-- Los reportes contables y use cases del web leen de aquí en lugar de
-- literales 0.19 / 19.00 regados por el código.

INSERT INTO app_settings (key, value, description) VALUES (
  'tax_config',
  '{
    "regimen": "comun",
    "iva_responsible": true,
    "iva_rate": 0.19,
    "price_includes_tax": true,
    "ica_municipio": "Bogotá D.C.",
    "ica_actividad_codigo": "36901",
    "ica_tarifa_por_mil": 9.66
  }'::jsonb,
  'Configuración tributaria del establecimiento (IVA, ICA, régimen). Ver specs/tax-config.spec.md.'
) ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN app_settings.value IS
  'JSONB de configuración. Para tax_config ver shape en specs/tax-config.spec.md.';
