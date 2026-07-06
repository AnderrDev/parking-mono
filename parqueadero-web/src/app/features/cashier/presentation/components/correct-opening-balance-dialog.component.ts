import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CurrencyInputDirective } from '../../../../shared/directives/currency-input.directive';

export interface CorrectOpeningBalanceDialogData {
  currentBalanceCents: number;
}

export interface CorrectOpeningBalanceDialogResult {
  openingBalanceCents: number;
}

@Component({
  selector: 'app-correct-opening-balance-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CurrencyInputDirective],
  template: `
    <div class="dialog" role="document">
      <header class="dialog__header">
        <h2 class="dialog__title">Corregir apertura</h2>
        <button type="button" class="dialog__close" (click)="cancel()" aria-label="Cerrar">×</button>
      </header>

      <label class="field">
        <span class="field__label">Saldo inicial correcto</span>
        <span class="field__money">
          <span class="field__prefix">$</span>
          <input appCurrencyInput class="field__input" [formControl]="balanceControl" placeholder="0" />
          <span class="field__suffix">COP</span>
        </span>
      </label>

      <div class="dialog__actions">
        <button type="button" class="btn btn--secondary" (click)="cancel()">Cancelar</button>
        <button
          type="button"
          class="btn btn--primary"
          [disabled]="balanceControl.value === data.currentBalanceCents || balanceControl.value < 0"
          (click)="save()"
        >
          Guardar corrección
        </button>
      </div>
    </div>
  `,
  styles: [`
    .dialog {
      width: min(420px, calc(100vw - 32px));
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
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .dialog__title {
      margin: 0;
      color: var(--color-text-strong);
      font-size: var(--text-lg);
      font-weight: var(--font-weight-semibold);
    }
    .dialog__close {
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      font-size: var(--text-xl);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .field__label {
      font-size: var(--text-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text);
    }
    .field__money {
      display: flex;
      align-items: center;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      overflow: hidden;
    }
    .field__prefix,
    .field__suffix {
      color: var(--color-text-muted);
      padding: 0 var(--space-3);
      font-size: var(--text-sm);
    }
    .field__input {
      min-height: 52px;
      flex: 1;
      min-width: 0;
      border: 0;
      background: transparent;
      color: var(--color-text);
      font: inherit;
      font-weight: var(--font-weight-semibold);
    }
    .field__input:focus { outline: none; }
    .dialog__actions {
      display: flex;
      gap: var(--space-2);
    }
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
    .btn--primary {
      background: var(--color-accent);
      color: var(--color-on-accent);
    }
  `],
})
export class CorrectOpeningBalanceDialogComponent {
  readonly data = inject<CorrectOpeningBalanceDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<
    DialogRef<CorrectOpeningBalanceDialogResult | undefined, CorrectOpeningBalanceDialogComponent>
  >(DialogRef);

  readonly balanceControl = new FormControl<number>(this.data.currentBalanceCents, {
    nonNullable: true,
  });

  save(): void {
    this.dialogRef.close({ openingBalanceCents: Number(this.balanceControl.value ?? 0) });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
