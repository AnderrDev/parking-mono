/**
 * Calcula el ancho relativo (en %) de una barra dentro de un track.
 * `min` evita que la barra desaparezca por completo cuando el valor es muy
 * pequeño respecto al máximo (default 0; usar 2 para mostrar siempre una pestañita).
 */
export function barWidth(value: number, max: number, minPct = 0): number {
  if (max <= 0) return 0;
  const pct = Math.round((value / max) * 100);
  return Math.max(minPct, pct);
}

/** Devuelve `value / total` redondeado a entero (%). 0 si total es 0. */
export function pctOf(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}
