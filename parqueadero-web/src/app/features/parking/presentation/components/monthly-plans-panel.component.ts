// MonthlyPlansPanelComponent — panel de mensualidades activas en parking.
// Spec: parqueadero-web/specs/components/monthly-plans-panel.spec.md

import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MonthlyPlanEntity } from '../../domain/entities/monthly-plan.entity';

const PLAN_TYPE_LABEL: Record<string, string> = {
  estandar: 'Estándar',
  premium: 'Premium',
  diurno: 'Diurno',
  nocturno: 'Nocturno',
};

export type UrgencyTone = 'danger' | 'warning' | 'info' | 'neutral';

const MAX_DISPLAY = 50;

@Component({
  selector: 'app-monthly-plans-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './monthly-plans-panel.component.html',
  styleUrl: './monthly-plans-panel.component.scss',
})
export class MonthlyPlansPanelComponent {
  private readonly _plans = signal<MonthlyPlanEntity[] | null>(null);

  @Input() set plans(value: MonthlyPlanEntity[] | null) {
    this._plans.set(value);
  }

  @Input() loading = false;
  @Input() error: string | null = null;

  @Output() readonly plateSelected = new EventEmitter<string>();

  /** Mensualidades visibles — ordenadas por días al vencimiento y capped. */
  protected readonly visiblePlans = computed(() => {
    const all = this._plans() ?? [];
    const sorted = [...all].sort(
      (a, b) => a.endDate.getTime() - b.endDate.getTime(),
    );
    return sorted.slice(0, MAX_DISPLAY);
  });

  protected readonly overflowCount = computed(() => {
    const total = this._plans()?.length ?? 0;
    return Math.max(0, total - MAX_DISPLAY);
  });

  protected planTypeLabel(t: string): string {
    return PLAN_TYPE_LABEL[t] ?? t;
  }

  protected formatEndDate(d: Date): string {
    return d.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  protected urgencyTone(days: number): UrgencyTone {
    if (days <= 0) return 'danger';
    if (days <= 3) return 'warning';
    if (days <= 7) return 'info';
    return 'neutral';
  }

  protected daysLabel(days: number): string {
    if (days < 0) return `Vencida hace ${Math.abs(days)} d`;
    if (days === 0) return 'Vence hoy';
    if (days === 1) return '1 día';
    return `${days} días`;
  }

  protected onPlateClick(plate: string): void {
    this.plateSelected.emit(plate);
  }
}
