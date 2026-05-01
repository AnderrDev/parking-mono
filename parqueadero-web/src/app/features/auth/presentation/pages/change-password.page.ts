import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CHANGE_PASSWORD_USECASE_TOKEN } from '../../../../core/di/injection-tokens';
import { ChangePasswordUseCase } from '../../domain/usecases/change-password.usecase';
import { AuthForms } from '../forms/auth.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';
import {
  NetworkFailure,
  ServerFailure,
  UnauthorizedFailure,
  ValidationFailure,
} from '../../../../core/either/failures';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-change-password-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, LoadingSpinnerComponent],
  templateUrl: './change-password.page.html',
  styleUrl: './change-password.page.scss',
})
export class ChangePasswordPageComponent implements OnInit {
  form!: FormGroup;
  readonly loading = signal(false);

  private readonly authForms = inject(AuthForms);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  constructor(
    @Inject(CHANGE_PASSWORD_USECASE_TOKEN)
    private readonly changePasswordUC: ChangePasswordUseCase,
  ) {}

  ngOnInit(): void {
    this.form = this.authForms.createChangePasswordForm();
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.loading.set(true);
    const v = this.form.getRawValue() as {
      currentPassword: string;
      newPassword: string;
      confirmation: string;
    };

    const result = await this.changePasswordUC.execute({
      currentPassword: v.currentPassword,
      newPassword: v.newPassword,
      confirmation: v.confirmation,
    });
    this.loading.set(false);

    result.fold(
      (failure) => {
        if (failure instanceof ValidationFailure) {
          this.toast.error(failure.message);
        } else if (failure instanceof UnauthorizedFailure) {
          this.toast.error(failure.message);
        } else if (failure instanceof NetworkFailure) {
          this.toast.warning('Sin conexión. Intenta más tarde.');
        } else if (failure instanceof ServerFailure) {
          this.toast.error(`Error del servidor: ${failure.message}`);
        } else {
          this.toast.error('Error inesperado. Intenta de nuevo.');
        }
      },
      () => {
        this.toast.success('Contraseña actualizada correctamente.');
        this.form.reset();
        void this.router.navigate(['/parking']);
      },
    );
  }

  showFieldError(field: string): boolean {
    const c = this.form.get(field);
    return !!c && c.invalid && c.touched;
  }

  fieldErrorMessage(field: string): string {
    return getErrorMessage(this.form.get(field)?.errors ?? null);
  }

  groupError(): string | null {
    const errs = this.form.errors;
    if (!errs) return null;
    return getErrorMessage(errs);
  }
}
