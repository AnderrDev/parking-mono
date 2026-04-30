import { Pipe, PipeTransform } from '@angular/core';
import { formatCOP } from '../utils/currency.utils';

@Pipe({ name: 'currencyCop', standalone: true, pure: true })
export class CurrencyCopPipe implements PipeTransform {
  transform(cents: number | null | undefined): string {
    if (cents === null || cents === undefined) return '—';
    return formatCOP(cents);
  }
}
