import { Pipe, PipeTransform } from '@angular/core';
import { formatPlate } from '../utils/plate.utils';

@Pipe({ name: 'plateFormat', standalone: true, pure: true })
export class PlateFormatPipe implements PipeTransform {
  transform(plate: string | null | undefined): string {
    if (!plate) return '—';
    return formatPlate(plate);
  }
}
