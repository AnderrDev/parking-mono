// Colombia: ABC123 (carro) o ABC12D (moto nueva) — 6 caracteres alfanuméricos
const PLATE_CAR_RE = /^[A-Z]{3}[0-9]{3}$/;
const PLATE_MOTO_RE = /^[A-Z]{3}[0-9]{2}[A-Z]$/;

export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6);
}

export function isValidPlate(plate: string): boolean {
  const normalized = normalizePlate(plate);
  return PLATE_CAR_RE.test(normalized) || PLATE_MOTO_RE.test(normalized);
}

export function formatPlate(plate: string): string {
  const normalized = normalizePlate(plate);
  if (normalized.length < 3) return normalized;
  return `${normalized.substring(0, 3)}-${normalized.substring(3)}`;
}
