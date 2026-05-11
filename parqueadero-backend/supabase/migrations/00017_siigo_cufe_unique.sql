-- 00017_siigo_cufe_unique.sql
-- Defensa explícita contra duplicación de CUFE devuelto por Siigo.
--
-- Contexto: 00013 agregó invoices.siigo_cufe sin UNIQUE. La columna legacy
-- invoices.cufe sí es UNIQUE (00002) y el trigger sync_dian_from_siigo
-- (00013) espeja siigo_cufe → cufe vía COALESCE, lo cual da una protección
-- INDIRECTA. Pero si el COALESCE preserva un cufe legacy distinto, dos
-- facturas podrían tener el mismo siigo_cufe sin disparar el conflicto en
-- la columna legacy. Esto es inaceptable: el CUFE es identificador fiscal
-- único frente a la DIAN.
--
-- Fix: índice único parcial — permite múltiples NULL (facturas pendientes
-- aún no estampadas) y rechaza duplicados solo cuando hay valor real.
--
-- Idempotente vía IF NOT EXISTS por si se reaplica.

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_siigo_cufe
  ON invoices (siigo_cufe)
  WHERE siigo_cufe IS NOT NULL;

COMMENT ON INDEX uq_invoices_siigo_cufe IS
  'Defensa explícita contra duplicación de CUFE de Siigo. Parcial: permite múltiples NULL para facturas en pending/Sent que aún no recibieron CUFE de Siigo.';
