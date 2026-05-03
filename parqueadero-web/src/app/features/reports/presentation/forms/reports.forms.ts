import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { todayIsoBogota } from '../../../../shared/utils/date.utils';

export type DateRangePreset = 'today' | 'week' | 'month' | 'lastMonth' | 'last30' | 'custom';

export interface DateRange {
  /** ISO `yyyy-MM-dd` en zona Bogotá. */
  dateFrom: string;
  /** ISO `yyyy-MM-dd` en zona Bogotá. */
  dateTo: string;
}

@Injectable({ providedIn: 'root' })
export class ReportsForms {
  constructor(private readonly fb: FormBuilder) {}

  createReportFilterForm(defaults: { dateFrom: string; dateTo: string; groupBy?: string; preset?: DateRangePreset; compare?: boolean }): FormGroup {
    return this.fb.group({
      preset: [defaults.preset ?? 'last30'],
      dateFrom: [defaults.dateFrom, Validators.required],
      dateTo: [defaults.dateTo, Validators.required],
      groupBy: [defaults.groupBy ?? 'day'],
      compare: [defaults.compare ?? false],
    });
  }

  /**
   * Calcula el rango ISO (yyyy-MM-dd, Bogotá) según el preset seleccionado.
   * 'custom' → no recalcula (la pantalla mantiene los valores actuales).
   */
  rangeForPreset(preset: DateRangePreset): DateRange | null {
    const todayIso = todayIsoBogota();
    const parts = todayIso.split('-').map(Number);
    const y = parts[0]!, m = parts[1]!, d = parts[2]!;
    // Construir Date interpretado como hoy a mediodía local — sirve para
    // operar con setDate/setMonth sin saltos por DST.
    const today = new Date(y, m - 1, d, 12, 0, 0, 0);

    const fmt = (date: Date): string => {
      const yy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    };

    switch (preset) {
      case 'today':
        return { dateFrom: todayIso, dateTo: todayIso };

      case 'week': {
        // Lunes de la semana actual (ISO: lun=1).
        const day = today.getDay() === 0 ? 7 : today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (day - 1));
        return { dateFrom: fmt(monday), dateTo: todayIso };
      }

      case 'month': {
        const first = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0, 0);
        return { dateFrom: fmt(first), dateTo: todayIso };
      }

      case 'lastMonth': {
        const first = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12, 0, 0, 0);
        const last = new Date(today.getFullYear(), today.getMonth(), 0, 12, 0, 0, 0);
        return { dateFrom: fmt(first), dateTo: fmt(last) };
      }

      case 'last30': {
        const start = new Date(today);
        start.setDate(today.getDate() - 29);
        return { dateFrom: fmt(start), dateTo: todayIso };
      }

      case 'custom':
      default:
        return null;
    }
  }

  /**
   * Calcula el rango anterior (mismo tamaño) inmediatamente previo al rango dado.
   * Ej: actual = 2026-05-01..2026-05-10 (10 días) → previo = 2026-04-21..2026-04-30.
   */
  previousRange(range: DateRange): DateRange {
    const fromParts = range.dateFrom.split('-').map(Number);
    const toParts = range.dateTo.split('-').map(Number);
    const from = new Date(fromParts[0]!, fromParts[1]! - 1, fromParts[2]!, 12, 0, 0, 0);
    const to = new Date(toParts[0]!, toParts[1]! - 1, toParts[2]!, 12, 0, 0, 0);
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;

    const prevTo = new Date(from);
    prevTo.setDate(from.getDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevTo.getDate() - (days - 1));

    const fmt = (date: Date): string => {
      const yy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    };
    return { dateFrom: fmt(prevFrom), dateTo: fmt(prevTo) };
  }
}
