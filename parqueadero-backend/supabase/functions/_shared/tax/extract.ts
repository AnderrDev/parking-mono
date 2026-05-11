// Helper compartido: extracción de base + IVA desde un total cobrado en caja.
// Spec: parqueadero-backend/specs/tax-config.spec.md
//
// Régimen del cliente (2026-05-04): común, responsable de IVA 19 %, precio
// publicado al cliente INCLUYE IVA. Por tanto, lo cobrado en caja
// (`payments.amount_cents`) es el TOTAL; la base gravable y el IVA se
// extraen, no se suman encima.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type TaxRegimen = 'comun' | 'simple' | 'no_responsable';

export interface TaxConfig {
  regimen: TaxRegimen;
  iva_responsible: boolean;
  iva_rate: number;
  price_includes_tax: boolean;
  ica_municipio?: string;
  ica_actividad_codigo?: string;
  ica_tarifa_por_mil?: number;
}

export interface InvoiceAmounts {
  base_cents: number;
  iva_cents: number;
  total_cents: number;
  iva_rate_applied: number;
}

const DEFAULTS: TaxConfig = {
  regimen: 'comun',
  iva_responsible: true,
  iva_rate: 0.19,
  price_includes_tax: true,
  ica_municipio: 'Bogotá D.C.',
  ica_actividad_codigo: '36901',
  ica_tarifa_por_mil: 9.66,
};

export async function getTaxConfig(supabase: SupabaseClient): Promise<TaxConfig> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'tax_config')
    .maybeSingle();
  if (!data || !data.value || typeof data.value !== 'object') return DEFAULTS;
  const v = data.value as Partial<TaxConfig>;
  return {
    regimen: v.regimen ?? DEFAULTS.regimen,
    iva_responsible: v.iva_responsible ?? DEFAULTS.iva_responsible,
    iva_rate: typeof v.iva_rate === 'number' ? v.iva_rate : DEFAULTS.iva_rate,
    price_includes_tax: v.price_includes_tax ?? DEFAULTS.price_includes_tax,
    ica_municipio: v.ica_municipio ?? DEFAULTS.ica_municipio,
    ica_actividad_codigo: v.ica_actividad_codigo ?? DEFAULTS.ica_actividad_codigo,
    ica_tarifa_por_mil: v.ica_tarifa_por_mil ?? DEFAULTS.ica_tarifa_por_mil,
  };
}

export function extractInvoiceAmounts(
  paymentAmountCents: number,
  config: TaxConfig,
): InvoiceAmounts {
  if (!config.iva_responsible) {
    return {
      base_cents: paymentAmountCents,
      iva_cents: 0,
      total_cents: paymentAmountCents,
      iva_rate_applied: 0,
    };
  }
  if (config.price_includes_tax) {
    const total = paymentAmountCents;
    const base = Math.round(total / (1 + config.iva_rate));
    return {
      base_cents: base,
      iva_cents: total - base,
      total_cents: total,
      iva_rate_applied: config.iva_rate,
    };
  }
  const base = paymentAmountCents;
  const iva = Math.round(base * config.iva_rate);
  return {
    base_cents: base,
    iva_cents: iva,
    total_cents: base + iva,
    iva_rate_applied: config.iva_rate,
  };
}
