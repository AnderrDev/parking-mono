import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { UserRole } from '../../../auth/domain/entities/user.entity';
import { UserForms } from '../forms/user.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';

export interface UserCreateFormValue {
  email: string;
  password: string;
  nombre: string;
  role: UserRole;
}

@Component({
  selector: 'app-user-create-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="dialog" role="document">
      <header class="dialog__header">
        <h2 class="dialog__title">Crear usuario</h2>
        <button type="button" class="dialog__close" (click)="onCancel()" aria-label="Cerrar">×</button>
      </header>

      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="dialog__form" novalidate>
        <label class="form-field">
          <span>Nombre *</span>
          <input type="text" formControlName="nombre" class="form-input"
            [class.form-input--error]="err('nombre')" placeholder="Nombre completo" />
          @if (err('nombre')) {
            <span class="form-field__error" role="alert">{{ errMsg('nombre') }}</span>
          }
        </label>
        <label class="form-field">
          <span>Email *</span>
          <input type="email" formControlName="email" class="form-input"
            [class.form-input--error]="err('email')" autocomplete="off" />
          @if (err('email')) {
            <span class="form-field__error" role="alert">{{ errMsg('email') }}</span>
          }
        </label>
        <label class="form-field">
          <span>Contraseña temporal * (mín. 8)</span>
          <input type="text" formControlName="password" class="form-input"
            [class.form-input--error]="err('password')" autocomplete="off" />
          @if (err('password')) {
            <span class="form-field__error" role="alert">{{ errMsg('password') }}</span>
          }
          <small>El usuario debería cambiarla en su primer ingreso.</small>
        </label>
        <label class="form-field">
          <span>Rol *</span>
          <select formControlName="role" class="form-input">
            <option value="operador">Operador</option>
            <option value="contador">Contador</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        <div class="dialog__actions">
          <button type="button" class="btn btn--secondary" (click)="onCancel()">Cancelar</button>
          <button type="submit" class="btn btn--primary">Crear</button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .dialog {
      background: var(--color-surface);
      border-radius: var(--radius-xl);
      max-width: 460px;
      width: 100%;
      padding: var(--space-5);
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      box-shadow: var(--shadow-3);
    }
    .dialog__header { display: flex; align-items: center; justify-content: space-between; }
    .dialog__title { font-size: var(--text-lg); font-weight: var(--font-weight-semibold); margin: 0; color: var(--color-text-strong); }
    .dialog__close {
      width: 32px; height: 32px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent; border: none; cursor: pointer;
      font-size: var(--text-xl);
      color: var(--color-text-muted);
      border-radius: var(--radius-md);

      &:hover { background: var(--color-bg-subtle); color: var(--color-text); }
    }
    .dialog__form { display: flex; flex-direction: column; gap: var(--space-3); }
    .form-field { display: flex; flex-direction: column; gap: 6px; font-size: var(--text-sm); }
    .form-field span { font-weight: var(--font-weight-medium); color: var(--color-text); }
    .form-field small { color: var(--color-text-muted); font-size: var(--text-xs); }
    .form-input {
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      font-size: var(--text-md);
      background: var(--color-surface);
      color: var(--color-text);
      min-height: var(--touch-target-min);

      &:focus { outline: none; border-color: var(--color-accent); box-shadow: var(--shadow-focus); }
    }
    .form-input--error { border-color: var(--color-danger); }
    .form-field__error {
      font-size: var(--text-xs);
      color: var(--color-danger);
    }
    .dialog__actions { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
    .btn {
      flex: 1; padding: var(--space-3) var(--space-4);
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
export class UserCreateDialogComponent implements OnInit {
  private readonly dialogRef = inject<DialogRef<UserCreateFormValue | undefined, UserCreateDialogComponent>>(DialogRef);
  private readonly userForms = inject(UserForms);
  form!: FormGroup;

  ngOnInit(): void {
    this.form = this.userForms.createCreateUserForm();
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
    const v = this.form.value as UserCreateFormValue;
    this.dialogRef.close({
      nombre: v.nombre.trim(),
      email: v.email.trim(),
      password: v.password,
      role: v.role,
    });
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
  }
}
