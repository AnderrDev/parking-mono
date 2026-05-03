import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { formatTimeBogota } from '../../../../shared/utils/date.utils';
import { formatCOP } from '../../../../shared/utils/currency.utils';

export type ShiftBannerState = 'loading' | 'error' | 'closed' | 'open';

@Component({
  selector: 'app-shift-status-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, LoadingSpinnerComponent],
  styleUrl: './shift-status-banner.component.scss',
  template: `
    @switch (state) {
      @case ('loading') {
        <section class="shift-banner shift-banner--loading" role="status" aria-live="polite">
          <span class="shift-banner__icon" aria-hidden="true"><app-loading-spinner /></span>
          <span class="shift-banner__text">Verificando estado de caja…</span>
        </section>
      }
      @case ('error') {
        <section class="shift-banner shift-banner--error" role="alert">
          <span class="shift-banner__icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </span>
          <div class="shift-banner__body">
            <span class="shift-banner__title">No pudimos verificar la caja</span>
            <span class="shift-banner__detail">{{ errorMessage }}</span>
          </div>
          <button type="button" class="shift-banner__cta shift-banner__cta--ghost" (click)="retry.emit()">
            Reintentar
          </button>
        </section>
      }
      @case ('closed') {
        <section class="shift-banner shift-banner--closed" role="alert">
          <span class="shift-banner__icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 9v4"/>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </span>
          <div class="shift-banner__body">
            <span class="shift-banner__title">Caja cerrada</span>
            <span class="shift-banner__detail">Para registrar entradas, primero debes abrir la caja.</span>
          </div>
          <a class="shift-banner__cta shift-banner__cta--primary" routerLink="/cashier">
            Abrir caja
          </a>
        </section>
      }
      @case ('open') {
        <section class="shift-banner shift-banner--open" role="status">
          <span class="shift-banner__icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          <div class="shift-banner__body">
            <span class="shift-banner__title">Caja abierta</span>
            <span class="shift-banner__detail">
              @if (openedAt) { Desde {{ openedTime }} }
              @if (openingBalanceCents !== null && openingBalanceCents !== undefined) {
                · Saldo apertura {{ openingBalance }}
              }
            </span>
          </div>
        </section>
      }
    }
  `,
})
export class ShiftStatusBannerComponent {
  @Input({ required: true }) state!: ShiftBannerState;
  @Input() errorMessage: string | null = null;
  @Input() openedAt: Date | null = null;
  @Input() openingBalanceCents: number | null = null;

  @Output() retry = new EventEmitter<void>();

  protected get openedTime(): string {
    return this.openedAt ? formatTimeBogota(this.openedAt) : '';
  }

  protected get openingBalance(): string {
    return this.openingBalanceCents !== null
      ? formatCOP(this.openingBalanceCents)
      : '';
  }
}
