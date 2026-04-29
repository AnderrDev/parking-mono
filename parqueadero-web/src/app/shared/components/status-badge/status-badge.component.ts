import { ChangeDetectionStrategy, Component, input } from '@angular/core';

type StatusKey = 'active' | 'monthly' | 'completed' | 'cancelled' | 'pending' | string;

const STATUS_LABELS: Record<string, string> = {
  active:    'Activo',
  monthly:   'Mensual',
  completed: 'Completado',
  cancelled: 'Cancelado',
  pending:   'Pendiente',
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="badge"
      [style.--badge-color]="'var(--color-status-' + status() + ')'"
    >
      {{ label() || STATUS_LABELS[status()] || status() }}
    </span>
  `,
  styles: [`
    .badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
      font-weight: var(--font-weight-semibold);
      line-height: 1;
      color: var(--badge-color, var(--color-text-muted));
      background-color: color-mix(in srgb, var(--badge-color, var(--color-text-muted)) 15%, transparent);
      border: 1px solid color-mix(in srgb, var(--badge-color, var(--color-text-muted)) 30%, transparent);
      white-space: nowrap;
    }
  `],
})
export class StatusBadgeComponent {
  status = input.required<StatusKey>();
  label  = input<string>('');

  protected readonly STATUS_LABELS = STATUS_LABELS;
}
