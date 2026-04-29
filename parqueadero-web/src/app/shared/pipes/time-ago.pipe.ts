import { Pipe, PipeTransform } from '@angular/core';
import { timeAgo } from '../utils/date.utils';

@Pipe({ name: 'timeAgo', standalone: true, pure: false })
export class TimeAgoPipe implements PipeTransform {
  transform(date: Date | string | null | undefined): string {
    if (!date) return '—';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';
    return timeAgo(d);
  }
}
