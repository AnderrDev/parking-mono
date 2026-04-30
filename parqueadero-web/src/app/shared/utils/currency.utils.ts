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
