import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import {
  paymentChannel,
  paymentMethodLabel,
} from '../../../../shared/utils/payment-method.utils';

export interface CloseShiftSummaryMethodRow {
  method: string;
  count: number;
  amountCents: number;
}

export interface CloseShiftSummaryDialogData {
  openingBalanceCents: number;
  byMethod: CloseShiftSummaryMethodRow[];
  cashCollectedCents: number;
  manualIncomeCents: number;
  withdrawalsTotalCents: number;
  cashExpectedCents: number;
  cashCountedCents: number;
  digitalCollectedCents: number;
  digitalVerifiedCents: number | null;
  totalRevenueCents: number;
  totalSessions: number;
  justification: string | null;
  /**
   * Ejecuta el cierre real. El dialog muestra errores inline y NO se cierra
   * si el backend rechaza (patrón onSubmit callback).
   */
  onConfirm: () => Promise<Either<Failure, unknown>>;
}

/** Resultado: 'closed' solo cuando el cierre se confirmó en backend. */
export type CloseShiftSummaryDialogResult = 'closed' | undefined;

@Component({
  selector: 'app-close-shift-summary-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="dialog" role="document">
      <header class="dialog__header">
        <div>
          <h2 class="dialog__title" id="close-shift-summary-title">Resumen de cierre</h2>
          <p class="dialog__subtitle">Verifica cada canal antes de confirmar. Un turno cerrado no se puede reabrir.</p>
        </div>
        <button type="button" class="dialog__close" (click)="cancel()" aria-label="Cerrar" [disabled]="loading()">×</button>
      </header>

      <div class="dialog__body">
        <!-- Efectivo -->
        <section class="channel channel--cash" aria-labelledby="summary-cash-title">
          <h3 class="channel__title" id="summary-cash-title">Efectivo en caja</h3>
          <dl class="rows">
            <div class="row"><dt>Base de apertura</dt><dd class="mono">{{ money(data.openingBalanceCents) }}</dd></div>
            <div class="row"><dt>Cobros en efectivo</dt><dd class="mono">+{{ money(data.cashCollectedCents) }}</dd></div>
            @if (data.manualIncomeCents > 0) {
              <div class="row"><dt>Entradas manuales</dt><dd class="mono">+{{ money(data.manualIncomeCents) }}</dd></div>
            }
            @if (data.withdrawalsTotalCents > 0) {
              <div class="row"><dt>Salidas manuales</dt><dd class="mono">−{{ money(data.withdrawalsTotalCents) }}</dd></div>
            }
            <div class="row row--strong"><dt>Esperado</dt><dd class="mono">{{ money(data.cashExpectedCents) }}</dd></div>
            <div class="row row--strong"><dt>Contado</dt><dd class="mono">{{ money(data.cashCountedCents) }}</dd></div>
          </dl>
          <div
            class="verdict"
            [class.verdict--ok]="cashDifference() === 0"
            [class.verdict--over]="cashDifference() > 0"
            [class.verdict--short]="cashDifference() < 0"
          >
            <span>{{ cashVerdictLabel() }}</span>
            <strong class="mono">{{ signedMoney(cashDifference()) }}</strong>
          </div>
        </section>

        <!-- Digital -->
        <section class="channel channel--digital" aria-labelledby="summary-digital-title">
          <h3 class="channel__title" id="summary-digital-title">Digital en cuentas</h3>
          @if (digitalRows().length > 0) {
            <dl class="rows">
              @for (row of digitalRows(); track row.method) {
                <div class="row">
                  <dt>{{ label(row.method) }} <span class="muted">· {{ row.count }} tx</span></dt>
                  <dd class="mono">{{ money(row.amountCents) }}</dd>
                </div>
              }
              <div class="row row--strong"><dt>Total digital</dt><dd class="mono">{{ money(data.digitalCollectedCents) }}</dd></div>
            </dl>
          } @else {
            <p class="channel__empty">Sin pagos digitales en este turno.</p>
          }
          @if (data.digitalVerifiedCents !== null) {
            <dl class="rows">
              <div class="row row--strong"><dt>Verificado en cuentas</dt><dd class="mono">{{ money(data.digitalVerifiedCents!) }}</dd></div>
            </dl>
            <div
              class="verdict"
              [class.verdict--ok]="digitalDifference() === 0"
              [class.verdict--over]="digitalDifference()! > 0"
              [class.verdict--short]="digitalDifference()! < 0"
            >
              <span>{{ digitalVerdictLabel() }}</span>
              <strong class="mono">{{ signedMoney(digitalDifference()!) }}</strong>
            </div>
          } @else if (data.digitalCollectedCents > 0) {
            <p class="channel__note">No verificaste las cuentas. Puedes cerrar igual: quedará registrado como "no verificado".</p>
          }
        </section>

        <!-- Sin cobro -->
        @if (freeRows().length > 0) {
          <section class="channel channel--free" aria-labelledby="summary-free-title">
            <h3 class="channel__title" id="summary-free-title">Sin cobro</h3>
            <dl class="rows">
              @for (row of freeRows(); track row.method) {
                <div class="row">
                  <dt>{{ label(row.method) }}</dt>
                  <dd class="muted">{{ row.count }} tx</dd>
                </div>
              }
            </dl>
          </section>
        }

        <div class="total">
          <span>Total recaudado · {{ data.totalSessions }} pagos</span>
          <strong class="mono">{{ money(data.totalRevenueCents) }}</strong>
        </div>

        @if (data.justification) {
          <p class="justification"><strong>Justificación:</strong> {{ data.justification }}</p>
        }

        @if (errorMsg()) {
          <p class="error" role="alert">{{ errorMsg() }}</p>
        }
      </div>

      <div class="dialog__actions">
        <button type="button" class="btn btn--secondary" (click)="cancel()" [disabled]="loading()">Volver</button>
        <button type="button" class="btn btn--danger" (click)="confirm()" [disabled]="loading()">
          {{ loading() ? 'Cerrando…' : 'Confirmar cierre' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .dialog {
      width: min(560px, calc(100vw - 32px));
      max-height: calc(100dvh - 48px);
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-5);
      background: var(--color-surface);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-3);
    }
    .dialog__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .dialog__title {
      margin: 0;
      color: var(--color-text-strong);
      font-size: var(--text-lg);
      font-weight: var(--font-weight-semibold);
    }
    .dialog__subtitle {
      margin: var(--space-1) 0 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }
    .dialog__close {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      font-size: var(--text-xl);
    }
    .dialog__body {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      overflow-y: auto;
      padding-right: var(--space-1);
    }
    .channel {
      border: 1px solid var(--color-border);
      border-left-width: 3px;
      border-radius: var(--radius-lg);
      padding: var(--space-3) var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .channel--cash { border-left-color: var(--color-success); }
    .channel--digital { border-left-color: var(--color-accent); }
    .channel--free { border-left-color: var(--color-border-strong); }
    .channel__title {
      margin: 0;
      font-size: var(--text-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-strong);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .channel__empty, .channel__note {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }
    .rows { margin: 0; display: flex; flex-direction: column; gap: var(--space-1); }
    .row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      font-size: var(--text-sm);
      color: var(--color-text);
    }
    .row dt { margin: 0; }
    .row dd { margin: 0; }
    .row--strong {
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-strong);
      border-top: 1px dashed var(--color-border);
      padding-top: var(--space-1);
    }
    .muted { color: var(--color-text-muted); }
    .mono { font-variant-numeric: tabular-nums; }
    .verdict {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      border-radius: var(--radius-md);
      padding: var(--space-2) var(--space-3);
      font-size: var(--text-sm);
      background: var(--color-surface-2);
    }
    .verdict--ok { background: var(--color-success-soft); color: var(--color-success-strong); }
    .verdict--over { background: var(--color-warning-soft); color: var(--color-warning-strong); }
    .verdict--short { background: var(--color-danger-soft); color: var(--color-danger-strong); }
    .total {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-lg);
      background: var(--color-surface-2);
      color: var(--color-text-strong);
      font-size: var(--text-sm);
    }
    .justification {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--color-text);
    }
    .error {
      margin: 0;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      background: var(--color-danger-soft);
      color: var(--color-danger-strong);
      font-size: var(--text-sm);
    }
    .dialog__actions { display: flex; gap: var(--space-2); }
    .btn {
      flex: 1;
      min-height: 48px;
      border-radius: var(--radius-md);
      border: 0;
      padding: 0 var(--space-4);
      font-size: var(--text-md);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn--secondary {
      border: 1px solid var(--color-border-strong);
      background: var(--color-surface);
      color: var(--color-text);
    }
    .btn--danger {
      background: var(--color-danger);
      color: var(--color-danger-fg);
    }
    .btn--danger:hover:not(:disabled) { background: var(--color-danger-strong); }
  `],
})
export class CloseShiftSummaryDialogComponent {
  readonly data = inject<CloseShiftSummaryDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<
    DialogRef<CloseShiftSummaryDialogResult, CloseShiftSummaryDialogComponent>
  >(DialogRef);

  readonly loading = signal(false);
  readonly errorMsg = signal<string | null>(null);

  readonly digitalRows = computed(() =>
    this.data.byMethod.filter((r) => paymentChannel(r.method) === 'digital'),
  );
  readonly freeRows = computed(() =>
    this.data.byMethod.filter((r) => paymentChannel(r.method) === 'free'),
  );

  cashDifference(): number {
    return this.data.cashCountedCents - this.data.cashExpectedCents;
  }

  digitalDifference(): number | null {
    if (this.data.digitalVerifiedCents === null) return null;
    return this.data.digitalVerifiedCents - this.data.digitalCollectedCents;
  }

  cashVerdictLabel(): string {
    const diff = this.cashDifference();
    if (diff === 0) return 'Caja cuadrada';
    return diff > 0 ? 'Sobrante de efectivo' : 'Faltante de efectivo';
  }

  digitalVerdictLabel(): string {
    const diff = this.digitalDifference() ?? 0;
    if (diff === 0) return 'Cuentas cuadradas';
    return diff > 0 ? 'Sobrante digital' : 'Faltante digital';
  }

  label(method: string): string {
    return paymentMethodLabel(method);
  }

  money(cents: number): string {
    return '$' + Math.round(cents / 100).toLocaleString('es-CO');
  }

  signedMoney(cents: number): string {
    const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
    return sign + this.money(Math.abs(cents));
  }

  async confirm(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.errorMsg.set(null);

    const result = await this.data.onConfirm();
    result.fold(
      (failure) => {
        this.errorMsg.set(failure.message);
        this.loading.set(false);
      },
      () => this.dialogRef.close('closed'),
    );
  }

  cancel(): void {
    if (this.loading()) return;
    this.dialogRef.close(undefined);
  }
}
