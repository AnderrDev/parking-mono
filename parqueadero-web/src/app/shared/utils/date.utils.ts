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

export function isSameDayBogota(a: Date, b: Date): boolean {
  return isSameDay(toBogota(a), toBogota(b));
}

export function nowBogota(): Date {
  return toBogota(new Date());
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 60_000);
}
