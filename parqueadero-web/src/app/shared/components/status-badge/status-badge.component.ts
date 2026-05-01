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
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.scss',
})
export class StatusBadgeComponent {
  status = input.required<StatusKey>();
  label  = input<string>('');

  protected readonly STATUS_LABELS = STATUS_LABELS;
}
