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

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} m`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  return mins > 0 ? `${hours} h ${mins} m` : `${hours} h`;
}
