const COP_FORMAT = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCOP(cents: number): string {
  const pesos = Math.round(cents / 100);
  // Intl.NumberFormat usa NBSP (U+00A0) como separador entre símbolo y número.
  // Lo reemplazamos por espacio normal para evitar problemas de copy/paste,
  // tests con strings literales y compatibilidad con sistemas no-Unicode.
  return COP_FORMAT.format(pesos).replace('COP', '$').replace(/\u00A0/g, ' ').trim();
}

export function centsToNumber(cents: number): number {
  return cents / 100;
}

export function numberToCents(pesos: number): number {
  // Sumamos un delta escalado (1e-9) post-multiplicación para corregir el
  // clásico bug de FP: 1.005 * 100 = 100.4999..., sin offset → Math.round = 100.
  // Number.EPSILON solo (~2.22e-16) es demasiado pequeño tras escalar × 100.
  // 1e-9 no afecta valores realistas de pesos (delta < 0.001 cents).
  return Math.round(pesos * 100 + 1e-9);
}

/**
 * Mínimo físico circulante en Colombia: $50. Usado como paso por defecto
 * para redondeo de cobros y validación de tarifas.
 */
export const COP_CASH_STEP_CENTS = 5000;

/**
 * Redondea un monto en centavos al múltiplo más cercano de `step` cents.
 * Por defecto, al múltiplo más cercano de $50 (5.000 cents) — coincide con
 * la moneda física más pequeña en circulación en Colombia, lo que permite
 * cobrar y dar cambio sin centavos.
 */
export function roundToCopStep(
  cents: number,
  stepCents: number = COP_CASH_STEP_CENTS,
): number {
  if (stepCents <= 0) return Math.round(cents);
  return Math.round(cents / stepCents) * stepCents;
}

/** True si `cents` ya es múltiplo de `stepCents` (default $50). */
export function isMultipleOfCopStep(
  cents: number,
  stepCents: number = COP_CASH_STEP_CENTS,
): boolean {
  if (stepCents <= 0) return true;
  return Number.isInteger(cents) && cents % stepCents === 0;
}
