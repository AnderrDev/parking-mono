import { formatDistanceToNow, format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const BOGOTA_TZ = 'America/Bogota';

export function toBogota(date: Date): Date {
  return toZonedTime(date, BOGOTA_TZ);
}

export function fromBogota(date: Date): Date {
  return fromZonedTime(date, BOGOTA_TZ);
}

export function timeAgo(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true, locale: es });
}

export function formatTimeBogota(date: Date, pattern = 'HH:mm'): string {
  return format(toBogota(date), pattern, { locale: es });
}

export function formatDateBogota(date: Date, pattern = 'dd/MM/yyyy'): string {
  return format(toBogota(date), pattern, { locale: es });
}

export function isSameDayBogota(a: Date | string, b: Date | string): boolean {
  return isSameDay(toBogota(new Date(a)), toBogota(new Date(b)));
}

export function nowBogota(): Date {
  return toBogota(new Date());
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 60_000);
}

export function durationMinutes(from: Date | string, to: Date | string): number {
  const diff = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(0, Math.floor(diff / 60_000));
}

/**
 * Devuelve la fecha actual en formato `YYYY-MM-DD` interpretada en zona
 * America/Bogota (no UTC). Útil para defaults en `<input type="date">`,
 * que espera el calendario local del usuario.
 */
export function todayIsoBogota(): string {
  return format(toBogota(new Date()), 'yyyy-MM-dd');
}

/**
 * Devuelve `today + days` en formato `YYYY-MM-DD` (zona Bogotá).
 */
export function isoBogotaPlusDays(days: number): string {
  const base = toBogota(new Date());
  base.setDate(base.getDate() + days);
  return format(base, 'yyyy-MM-dd');
}

/**
 * Convierte una fecha civil `YYYY-MM-DD` (columna DATE de Postgres) a un
 * `Date` en la medianoche LOCAL.
 *
 * `new Date('2026-08-11')` NO sirve para esto: el estándar obliga a leer
 * ese formato como UTC, así que en Colombia (UTC-5) el Date resultante es
 * el 10 de agosto a las 19:00. Eso desplaza un día lo que se muestra con
 * `DatePipe` y hace que un plan se lea como vencido durante todo su último
 * día de vigencia. Una columna DATE no tiene hora ni zona: representa un
 * día del calendario y hay que anclarla al calendario local.
 */
export function parseIsoDateOnly(iso: string): Date {
  const parts = iso.slice(0, 10).split('-').map(Number);
  return new Date(parts[0]!, parts[1]! - 1, parts[2]!);
}

/**
 * Serializa un `Date` a `YYYY-MM-DD` leyendo sus componentes LOCALES.
 * `toISOString()` convierte a UTC antes de formatear y puede correr la
 * fecha un día según la hora del Date.
 */
export function formatIsoDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Hoy en Colombia, como fecha civil anclada a la medianoche local. Es el
 * punto de comparación correcto contra `start_date` / `end_date`.
 */
export function todayDateOnlyBogota(): Date {
  return parseIsoDateOnly(todayIsoBogota());
}

/**
 * Convierte un label de período (`YYYY-MM-DD`, `YYYY-Www`, `YYYY-MM`) a una
 * etiqueta legible en zona Bogotá. Para `day` devuelve "lun 03 may"; los
 * demás formatos los devuelve intactos (ya son legibles).
 */
export function formatBogotaDay(label: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const parts = label.split('-').map(Number);
    const date = new Date(parts[0]!, parts[1]! - 1, parts[2]!, 12, 0, 0, 0);
    return date.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' });
  }
  return label;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} m`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  return mins > 0 ? `${hours} h ${mins} m` : `${hours} h`;
}
