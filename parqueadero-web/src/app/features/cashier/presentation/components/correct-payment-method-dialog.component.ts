import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { PaymentMethod } from '../../../parking/domain/entities/payment.entity';

export interface CorrectPaymentMethodDialogData {
  currentMethod: PaymentMethod;
  label: string;
}

export interface CorrectPaymentMethodDialogResult {
  method: PaymentMethod;
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta_credito', label: 'Tarjeta crédito' },
  { value: 'tarjeta_debito', label: 'Tarjeta débito' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'nequi', label: 'Nequi' },
  { value: 'daviplata', label: 'Daviplata' },
];

@Component({
  selector: 'app-correct-payment-method-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="dialog" role="document">
      <header class="dialog__header">
        <h2 id="correct-payment-method-title" class="dialog__title">Corregir pago</h2>
        <button type="button" class="dialog__close" (click)="cancel()" aria-label="Cerrar">×</button>
      </header>

      <p class="dialog__intro">
        Cambia el método registrado para <strong>{{ data.label }}</strong>.
      </p>

      <div class="method-grid" role="radiogroup" aria-labelledby="correct-payment-method-title">
        @for (method of methods; track method.value) {
          <label class="method-option" [class.method-option--active]="methodControl.value === method.value">
            <input type="radio" [formControl]="methodControl" [value]="method.value" />
            <span>{{ method.label }}</span>
          </label>
        }
      </div>

      <div class="dialog__actions">
        <button type="button" class="btn btn--secondary" (click)="cancel()">Cancelar</button>
        <button
          type="button"
          class="btn btn--primary"
          [disabled]="methodControl.value === data.currentMethod"
          (click)="save()"
        >
          Guardar corrección
        </button>
      </div>
    </div>
  `,
  styles: [`
    .dialog {
      width: min(480px, calc(100vw - 32px));
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
    .dialog__intro {
      margin: 0;
      color: var(--color-text);
      font-size: var(--text-sm);
    }
    .method-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2);
    }
    .method-option {
      min-height: 48px;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      color: var(--color-text);
      cursor: pointer;
    }
    .method-option--active {
      border-color: var(--color-accent);
      background: var(--color-accent-soft);
      color: var(--color-text-strong);
      font-weight: var(--font-weight-semibold);
    }
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
export class CorrectPaymentMethodDialogComponent {
  readonly data = inject<CorrectPaymentMethodDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<
    DialogRef<CorrectPaymentMethodDialogResult | undefined, CorrectPaymentMethodDialogComponent>
  >(DialogRef);

  readonly methods = METHODS;
  readonly methodControl = new FormControl<PaymentMethod>(this.data.currentMethod, {
    nonNullable: true,
  });

  save(): void {
    this.dialogRef.close({ method: this.methodControl.value });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
