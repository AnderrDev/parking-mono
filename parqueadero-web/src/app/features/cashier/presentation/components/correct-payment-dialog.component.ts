import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { PaymentMethod } from '../../../parking/domain/entities/payment.entity';
import { CurrencyInputDirective } from '../../../../shared/directives/currency-input.directive';

export interface CorrectPaymentDialogResult {
  method: PaymentMethod;
  amountCents: number;
  reason: string;
}

export interface CorrectPaymentDialogData {
  currentMethod: PaymentMethod;
  currentAmountCents: number;
  label: string;
  /** Ejecuta la corrección; retorna mensaje de error para mostrar inline o null si ok. */
  onSubmit: (value: CorrectPaymentDialogResult) => Promise<string | null>;
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta_credito', label: 'Tarjeta crédito' },
  { value: 'tarjeta_debito', label: 'Tarjeta débito' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'nequi', label: 'Nequi' },
  { value: 'daviplata', label: 'Daviplata' },
];

const MIN_REASON_LENGTH = 10;

@Component({
  selector: 'app-correct-payment-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CurrencyInputDirective],
  template: `
    <div class="dialog" role="document">
      <header class="dialog__header">
        <h2 id="correct-payment-title" class="dialog__title">Corregir pago</h2>
        <button type="button" class="dialog__close" (click)="cancel()" aria-label="Cerrar">×</button>
      </header>

      <p class="dialog__intro">
        Ajusta el método o el monto registrado para <strong>{{ data.label }}</strong>.
      </p>

      <div class="method-grid" role="radiogroup" aria-labelledby="correct-payment-title">
        @for (method of methods; track method.value) {
          <label class="method-option" [class.method-option--active]="methodValue() === method.value">
            <input type="radio" [formControl]="methodControl" [value]="method.value" />
            <span>{{ method.label }}</span>
          </label>
        }
      </div>

      <div class="form-field">
        <label class="form-label" for="correct-amount">Monto cobrado *</label>
        <div class="cash-input">
          <span class="cash-input__prefix" aria-hidden="true">$</span>
          <input
            id="correct-amount"
            appCurrencyInput
            class="form-input"
            [formControl]="amountControl"
            placeholder="0"
          />
        </div>
      </div>

      @if (amountChanged()) {
        <div class="form-field">
          <label class="form-label" for="correct-reason">Motivo de la corrección *</label>
          <textarea
            id="correct-reason"
            class="form-input"
            [formControl]="reasonControl"
            rows="2"
            placeholder="Ej: cobro acordado distinto al calculado (mínimo 10 caracteres)"
          ></textarea>
        </div>
      }

      @if (error()) {
        <p class="dialog__error" role="alert">{{ error() }}</p>
      }

      <div class="dialog__actions">
        <button type="button" class="btn btn--secondary" (click)="cancel()" [disabled]="saving()">
          Cancelar
        </button>
        <button
          type="button"
          class="btn btn--primary"
          [disabled]="!hasChanges() || saving()"
          (click)="save()"
        >
          {{ saving() ? 'Guardando…' : 'Guardar corrección' }}
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
    .form-field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .form-label {
      color: var(--color-text);
      font-size: var(--text-sm);
      font-weight: var(--font-weight-semibold);
    }
    .cash-input {
      position: relative;
      display: flex;
      align-items: center;
    }
    .cash-input__prefix {
      position: absolute;
      left: var(--space-3);
      color: var(--color-text-muted);
    }
    .cash-input .form-input { padding-left: var(--space-6); }
    .form-input {
      width: 100%;
      min-height: 44px;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text-strong);
      font-size: var(--text-md);
    }
    .dialog__error {
      margin: 0;
      padding: var(--space-3);
      border-radius: var(--radius-md);
      background: var(--color-danger-soft, #fdecea);
      color: var(--color-danger, #b3261e);
      font-size: var(--text-sm);
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
export class CorrectPaymentDialogComponent {
  readonly data = inject<CorrectPaymentDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<void, CorrectPaymentDialogComponent>>(DialogRef);

  readonly methods = METHODS;
  readonly methodControl = new FormControl<PaymentMethod>(this.data.currentMethod, {
    nonNullable: true,
  });
  readonly amountControl = new FormControl<number | null>(this.data.currentAmountCents);
  readonly reasonControl = new FormControl<string>('', { nonNullable: true });

  // Señales espejo: computed sobre FormControl.value no es reactivo (OnPush).
  protected readonly methodValue = toSignal(this.methodControl.valueChanges, {
    initialValue: this.methodControl.value,
  });
  private readonly amountValue = toSignal(this.amountControl.valueChanges, {
    initialValue: this.amountControl.value,
  });

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly amountChanged = computed(
    () => this.amountValue() !== null && this.amountValue() !== this.data.currentAmountCents,
  );
  protected readonly hasChanges = computed(
    () => this.amountChanged() || this.methodValue() !== this.data.currentMethod,
  );

  async save(): Promise<void> {
    if (this.saving()) return;
    this.error.set(null);

    const amountCents = this.amountControl.value;
    if (amountCents === null || amountCents <= 0) {
      this.error.set('El monto debe ser mayor a $0. Para eliminar el cobro usa la anulación.');
      return;
    }

    const reason = this.reasonControl.value.trim();
    if (this.amountChanged() && reason.length < MIN_REASON_LENGTH) {
      this.error.set(`El motivo de la corrección es obligatorio (mínimo ${MIN_REASON_LENGTH} caracteres).`);
      return;
    }

    this.saving.set(true);
    const message = await this.data.onSubmit({
      method: this.methodControl.value,
      amountCents,
      reason,
    });
    this.saving.set(false);

    if (message) {
      // Error backend inline: el modal no se cierra, el operador no pierde lo digitado.
      this.error.set(message);
      return;
    }
    this.dialogRef.close();
  }

  cancel(): void {
    if (this.saving()) return;
    this.dialogRef.close();
  }
}
