const COP_FORMAT = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCOP(cents: number): string {
  const pesos = Math.round(cents / 100);
  return COP_FORMAT.format(pesos).replace('COP', '$').trim();
}

export function centsToNumber(cents: number): number {
  return cents / 100;
}

export function numberToCents(pesos: number): number {
  return Math.round(pesos * 100);
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
 *
 * Ejemplos: 16.667 → 15.000 ($150); 17.500 → 17.500 ($175 → no, sí: 17500 / 5000 = 3.5,
 * redondea a 4 → 20.000 = $200, half-up).
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
