import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="dialog"
      role="alertdialog"
      aria-modal="true"
      [attr.aria-labelledby]="'dialog-title'"
      [attr.aria-describedby]="'dialog-desc'"
    >
      <h2 class="dialog__title" id="dialog-title">{{ data.title }}</h2>
      <p class="dialog__message" id="dialog-desc">{{ data.message }}</p>

      <div class="dialog__actions">
        <button
          class="dialog__btn dialog__btn--cancel"
          type="button"
          (click)="cancel()"
        >
          {{ data.cancelLabel ?? 'Cancelar' }}
        </button>
        <button
          class="dialog__btn"
          [class.dialog__btn--danger]="data.variant === 'danger'"
          [class.dialog__btn--warning]="data.variant === 'warning'"
          [class.dialog__btn--primary]="!data.variant || data.variant === 'default'"
          type="button"
          (click)="confirm()"
          cdkFocusInitial
        >
          {{ data.confirmLabel ?? 'Confirmar' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .dialog {
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      padding: var(--space-6);
      max-width: min(480px, 90vw);
      box-shadow: var(--shadow-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .dialog__title {
      font-size: var(--text-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .dialog__message {
      font-size: var(--text-md);
      color: var(--color-text-muted);
      line-height: var(--line-height-normal);
    }

    .dialog__actions {
      display: flex;
      gap: var(--space-3);
      justify-content: flex-end;
      flex-wrap: wrap;
    }

    .dialog__btn {
      padding: var(--space-3) var(--space-5);
      border-radius: var(--radius-md);
      font-weight: var(--font-weight-semibold);
      font-size: var(--text-md);
      min-height: var(--touch-target-secondary);
      cursor: pointer;
      transition: opacity var(--motion-fast) var(--ease-out);

      &:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }

      &:active { opacity: 0.88; }
    }

    .dialog__btn--cancel {
      background: var(--color-surface-2);
      color: var(--color-text);
      border: 1px solid var(--color-border);
    }

    .dialog__btn--primary {
      background: var(--color-primary);
      color: var(--color-primary-fg);
    }

    .dialog__btn--danger {
      background: var(--color-danger);
      color: var(--color-danger-fg);
    }

    .dialog__btn--warning {
      background: var(--color-warning);
      color: var(--color-warning-fg);
    }
  `],
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<boolean>);

  cancel(): void { this.dialogRef.close(false); }
  confirm(): void { this.dialogRef.close(true); }
}
