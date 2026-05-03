// Colombia: ABC123 (carro) o ABC12D (moto nueva) — 6 caracteres alfanuméricos
const PLATE_CAR_RE = /^[A-Z]{3}[0-9]{3}$/;
const PLATE_MOTO_RE = /^[A-Z]{3}[0-9]{2}[A-Z]$/;

export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6);
}

export function isValidPlate(plate: string): boolean {
  // Limpiar (uppercase + remover no-alfanuméricos) pero NO recortar a 6.
  // Si entra "ZZZ999999" debe ser inválido, no normalizarse silenciosamente
  // a "ZZZ999". Para inputs de UI usar `normalizePlate` que sí recorta.
  const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return PLATE_CAR_RE.test(cleaned) || PLATE_MOTO_RE.test(cleaned);
}

export function formatPlate(plate: string): string {
  const normalized = normalizePlate(plate);
  if (normalized.length < 3) return normalized;
  return `${normalized.substring(0, 3)}-${normalized.substring(3)}`;
}
