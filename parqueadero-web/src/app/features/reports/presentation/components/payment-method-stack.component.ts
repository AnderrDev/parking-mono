import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CurrencyCopPipe } from '../../../../shared/pipes/currency-cop.pipe';
import { pctOf } from '../../../../shared/utils/chart.utils';

export interface MethodSlice {
  method: string;
  amountCents: number;
  count: number;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  free: 'Gratis (cortesía/mensualidad)',
};

/**
 * Stack horizontal con leyenda. Muestra distribución de pagos por método.
 * 4 colores fijos por método: cash → success, card → accent, transfer → info,
 * free → monthly.
 */
@Component({
  selector: 'app-payment-method-stack',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CurrencyCopPipe],
  styleUrl: './payment-method-stack.component.scss',
  template: `
    @if (slices.length === 0) {
      <p class="empty">Sin pagos en el período.</p>
    } @else {
      <div class="stack-bar" role="img" [attr.aria-label]="'Distribución por método de pago'">
        @for (s of slices; track s.method) {
          <span
            class="stack-bar__seg"
            [attr.data-method]="s.method"
            [style.width.%]="pct(s.amountCents)"
            [title]="label(s.method) + ': ' + (s.amountCents / 100 | currency:'COP':'symbol-narrow':'1.0-0') + ' (' + pct(s.amountCents) + '%)'"
          ></span>
        }
      </div>
      <ul class="legend" role="list">
        @for (s of slices; track s.method) {
          <li class="legend__item">
            <span class="legend__dot" [attr.data-method]="s.method"></span>
            <span class="legend__label">{{ label(s.method) }}</span>
            <span class="legend__value mono">
              {{ s.amountCents | currencyCop }} · {{ pct(s.amountCents) }}%
              <small class="legend__count">({{ s.count }} {{ s.count === 1 ? 'pago' : 'pagos' }})</small>
            </span>
          </li>
        }
      </ul>
    }
  `,
})
export class PaymentMethodStackComponent {
  @Input({ required: true }) slices: MethodSlice[] = [];

  protected get totalCents(): number {
    return this.slices.reduce((s, m) => s + m.amountCents, 0);
  }

  protected pct(amountCents: number): number {
    return pctOf(amountCents, this.totalCents);
  }

  protected label(method: string): string {
    return METHOD_LABELS[method] ?? method;
  }
}
