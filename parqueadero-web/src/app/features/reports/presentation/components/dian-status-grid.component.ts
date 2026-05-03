import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CurrencyCopPipe } from '../../../../shared/pipes/currency-cop.pipe';
import { DianStatus } from '../../../invoicing/domain/entities/invoice.entity';

export interface DianStatusEntry {
  status: DianStatus;
  count: number;
  totalCents: number;
}

const DIAN_LABELS: Record<DianStatus, string> = {
  accepted: 'Aceptada',
  sent: 'Enviada',
  pending: 'Pendiente',
  rejected: 'Rechazada',
  contingency: 'Contingencia',
};

/**
 * Grid de tarjetas con estado DIAN y conteo + monto. Color de fondo según
 * estado (success, info, danger, warning, neutral).
 */
@Component({
  selector: 'app-dian-status-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CurrencyCopPipe],
  styleUrl: './dian-status-grid.component.scss',
  template: `
    <ul class="status-grid" role="list">
      @for (s of entries; track s.status) {
        <li class="status-card" [attr.data-status]="s.status">
          <span class="status-card__name">{{ label(s.status) }}</span>
          <strong class="status-card__count">{{ s.count }}</strong>
          <span class="status-card__amount mono">{{ s.totalCents | currencyCop }}</span>
        </li>
      }
    </ul>
  `,
})
export class DianStatusGridComponent {
  @Input({ required: true }) entries: DianStatusEntry[] = [];

  protected label(s: DianStatus): string {
    return DIAN_LABELS[s] ?? s;
  }
}
