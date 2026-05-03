import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VehicleType } from '../../domain/entities/parking-session.entity';
import { formatCOP } from '../../../../shared/utils/currency.utils';

export interface ExitReceipt {
  plate: string;
  vehicleType: VehicleType;
  entryAt: Date;
  exitAt: Date;
  durationMinutes: number;
  amountCents: number;
  paymentMethod: string;
  cashReceivedCents: number | null;
}

/**
 * Tarjeta de comprobante post-salida con auto-dismiss controlado por la
 * page padre. Emite eventos para pause/resume del timer al pasar el mouse,
 * dismiss explícito y print.
 */
@Component({
  selector: 'app-receipt-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  styleUrl: './receipt-card.component.scss',
  template: `
    @if (receipt) {
      <div class="receipt-card" role="status" aria-label="Comprobante de salida listo"
           (mouseenter)="pause.emit()" (mouseleave)="resume.emit()"
           (focusin)="pause.emit()" (focusout)="resume.emit()">
        <div class="receipt-card__head">
          <span class="receipt-card__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </span>
          <div class="receipt-card__info">
            <p class="receipt-card__title">Comprobante listo</p>
            <p class="receipt-card__plate mono">{{ receipt.plate }}</p>
          </div>
          <button type="button" class="receipt-card__dismiss" (click)="dismiss.emit()" aria-label="Cerrar comprobante">×</button>
        </div>
        <div class="receipt-card__body">
          <span class="receipt-card__amount">
            {{ receipt.amountCents > 0 ? formatCOP(receipt.amountCents) : 'Sin cobro' }}
          </span>
          <span class="receipt-card__method">{{ receipt.paymentMethod }}</span>
        </div>
        <button type="button" class="receipt-card__print" (click)="print.emit()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Imprimir comprobante
        </button>
      </div>
    }
  `,
})
export class ReceiptCardComponent {
  @Input() receipt: ExitReceipt | null = null;

  @Output() dismiss = new EventEmitter<void>();
  @Output() print = new EventEmitter<void>();
  @Output() pause = new EventEmitter<void>();
  @Output() resume = new EventEmitter<void>();

  protected readonly formatCOP = formatCOP;
}
