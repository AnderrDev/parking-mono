import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CashierForms } from '../forms/cashier.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';

export interface WithdrawalFormValue {
  amountCents: number;
  recipient: string;
  justification: string;
}

@Component({
  selector: 'app-cash-withdrawal-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="dialog" role="document">
      <header class="dialog__header">
        <h2 class="dialog__title">Retiro parcial de efectivo</h2>
        <button type="button" class="dialog__close" (click)="onCancel()" aria-label="Cerrar">×</button>
      </header>

      <p class="dialog__intro">
        Registra un retiro parcial. El monto se descontará del efectivo esperado al cerrar el turno.
      </p>

      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="dialog__form" novalidate>
        <div class="form-field">
          <label class="form-label" for="amount">Monto retirado *</label>
          <div class="cash-input">
            <span class="cash-input__prefix" aria-hidden="true">$</span>
            <input
              id="amount"
              type="number"
              class="form-input"
              [class.form-input--error]="err('amountCents')"
              formControlName="amountCents"
              min="100"
              step="100"
              inputmode="numeric"
              placeholder="0"
            />
          </div>
          @if (err('amountCents')) {
            <span class="form-error" role="alert">{{ errMsg('amountCents') }}</span>
          }
        </div>

        <div class="form-field">
          <label class="form-label" for="recipient">Entregado a *</label>
          <input
            id="recipient"
            type="text"
            class="form-input"
            [class.form-input--error]="err('recipient')"
            formControlName="recipient"
            placeholder="Nombre de la persona o cargo"
          />
          @if (err('recipient')) {
            <span class="form-error" role="alert">{{ errMsg('recipient') }}</span>
          }
        </div>

        <div class="form-field">
          <label class="form-label" for="justification">Justificación *</label>
          <textarea
            id="justification"
            class="form-input"
            [class.form-input--error]="err('justification')"
            formControlName="justification"
            rows="2"
            placeholder="Razón del retiro"
          ></textarea>
          @if (err('justification')) {
            <span class="form-error" role="alert">{{ errMsg('justification') }}</span>
          }
        </div>

        <div class="dialog__actions">
          <button type="button" class="btn btn--secondary" (click)="onCancel()">Cancelar</button>
          <button type="submit" class="btn btn--primary">Registrar retiro</button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .dialog {
      background: var(--color-surface);
      border-radius: var(--radius-xl);
      width: 100%;
      max-width: 480px;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-5);
      box-shadow: var(--shadow-3);
    }
    .dialog__header { display: flex; align-items: center; justify-content: space-between; }
    .dialog__title { font-size: var(--text-lg); font-weight: var(--font-weight-semibold); color: var(--color-text-strong); margin: 0; }
    .dialog__close {
      width: 32px; height: 32px;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: var(--text-xl);
      background: transparent;
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;
      color: var(--color-text-muted);
      &:hover { background: var(--color-bg-subtle); color: var(--color-text); }
    }
    .dialog__intro {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }
    .dialog__form { display: flex; flex-direction: column; gap: var(--space-3); }
    .form-field { display: flex; flex-direction: column; gap: var(--space-2); }
    .form-label { font-size: var(--text-sm); font-weight: var(--font-weight-medium); color: var(--color-text); }
    .form-input {
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      font-family: var(--font-sans);
      font-size: var(--text-md);
      background: var(--color-surface);
      color: var(--color-text);
      width: 100%;

      &:focus { outline: none; border-color: var(--color-accent); box-shadow: var(--shadow-focus); }
    }
    .form-input--error { border-color: var(--color-danger); }
    .form-error { font-size: var(--text-xs); color: var(--color-danger); font-weight: var(--font-weight-medium); }
    .cash-input { position: relative; }
    .cash-input__prefix {
      position: absolute;
      left: var(--space-3);
      top: 50%;
      transform: translateY(-50%);
      color: var(--color-text-muted);
      font-weight: var(--font-weight-semibold);
    }
    .cash-input .form-input {
      padding-left: calc(var(--space-3) * 2 + 8px);
    }
    .dialog__actions { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
    .btn {
      flex: 1;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      font-size: var(--text-md);
      font-weight: var(--font-weight-semibold);
      min-height: 48px;
      cursor: pointer;
      border: none;
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .btn--primary {
      background: var(--color-primary);
      color: var(--color-primary-fg);
      &:not(:disabled):hover { background: var(--color-primary-hover); }
    }
    .btn--secondary {
      background: var(--color-surface);
      color: var(--color-text);
      border: 1px solid var(--color-border-strong);
      &:not(:disabled):hover { background: var(--color-bg-subtle); }
    }
  `],
})
export class CashWithdrawalDialogComponent implements OnInit {
  private readonly dialogRef = inject<DialogRef<WithdrawalFormValue | undefined, CashWithdrawalDialogComponent>>(DialogRef);
  private readonly cashierForms = inject(CashierForms);

  form!: FormGroup;

  ngOnInit(): void {
    this.form = this.cashierForms.createWithdrawalForm();
  }

  err(field: string): boolean {
    const c = this.form.get(field);
    return !!c && c.invalid && c.touched;
  }

  errMsg(field: string): string {
    return getErrorMessage(this.form.get(field)?.errors ?? null);
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.value as WithdrawalFormValue;
    this.dialogRef.close({
      amountCents: Number(v.amountCents),
      recipient: v.recipient.trim(),
      justification: v.justification.trim(),
    });
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
  }
}
