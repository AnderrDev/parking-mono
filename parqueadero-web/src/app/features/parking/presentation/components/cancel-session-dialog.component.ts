import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ParkingForms } from '../forms/parking.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';

export interface CancelSessionDialogData {
  plate: string;
}

@Component({
  selector: 'app-cancel-session-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="dialog" role="document">
      <header class="dialog__header">
        <h2 class="dialog__title">Anular sesión</h2>
        <button type="button" class="dialog__close" (click)="onCancel()" aria-label="Cerrar">×</button>
      </header>

      <p class="dialog__intro">
        Vas a anular la sesión de <strong>{{ data.plate }}</strong>.
        Esta acción no se puede deshacer y queda registrada en auditoría.
      </p>

      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="dialog__form">
        <label class="form-field">
          <span class="form-label">Motivo de anulación *</span>
          <textarea
            formControlName="reason"
            class="form-input"
            rows="3"
            placeholder="Describe por qué se está anulando esta sesión (mínimo 10 caracteres)"
          ></textarea>
          @if (err('reason')) {
            <span class="form-error" role="alert">{{ errMsg('reason') }}</span>
          }
        </label>

        <div class="dialog__actions">
          <button type="button" class="btn btn--secondary" (click)="onCancel()">Cancelar</button>
          <button type="submit" class="btn btn--danger" [disabled]="form.invalid">Anular sesión</button>
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
    .dialog__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .dialog__title {
      font-size: var(--text-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-strong);
      margin: 0;
    }
    .dialog__close {
      width: 32px; height: 32px;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: var(--text-xl);
      color: var(--color-text-muted);
      background: transparent;
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;

      &:hover { background: var(--color-bg-subtle); color: var(--color-text); }
    }
    .dialog__intro {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--color-text);
      padding: var(--space-3) var(--space-4);
      background: var(--color-warning-soft);
      border: 1px solid color-mix(in srgb, var(--color-warning) 25%, transparent);
      border-radius: var(--radius-md);
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
      resize: vertical;
      min-height: 80px;

      &:focus { outline: none; border-color: var(--color-accent); box-shadow: var(--shadow-focus); }
    }
    .form-error { font-size: var(--text-xs); color: var(--color-danger); font-weight: var(--font-weight-medium); }
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
    .btn--secondary {
      background: var(--color-surface);
      color: var(--color-text);
      border: 1px solid var(--color-border-strong);

      &:not(:disabled):hover { background: var(--color-bg-subtle); }
    }
    .btn--danger {
      background: var(--color-danger);
      color: var(--color-danger-fg);

      &:not(:disabled):hover { background: var(--color-danger-strong); }
    }
  `],
})
export class CancelSessionDialogComponent implements OnInit {
  readonly data = inject<CancelSessionDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<{ reason: string } | undefined, CancelSessionDialogComponent>>(DialogRef);
  private readonly parkingForms = inject(ParkingForms);

  form!: FormGroup;

  ngOnInit(): void {
    this.form = this.parkingForms.createCancelSessionForm();
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
    const reason = (this.form.value.reason as string).trim();
    this.dialogRef.close({ reason });
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
  }
}
