import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ErrorDisplayComponent } from '../../../../shared/components/error-display/error-display.component';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';
import {
  NetworkFailure,
  ServerFailure,
  UnauthorizedFailure,
  ValidationFailure,
} from '../../../../core/either/failures';
import { LOGIN_USECASE_TOKEN } from '../../../../core/di/injection-tokens';
import { LoginUseCase } from '../../domain/usecases/login.usecase';
import { AuthForms } from '../forms/auth.forms';
import { UserRole } from '../../domain/entities/user.entity';

@Component({
  selector: 'app-login-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ErrorDisplayComponent, LoadingSpinnerComponent],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPageComponent implements OnInit {
  form!: FormGroup;
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);

  protected togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  constructor(
    @Inject(LOGIN_USECASE_TOKEN) private readonly loginUseCase: LoginUseCase,
    private readonly authForms: AuthForms,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.form = this.authForms.createLoginForm();
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.loading.set(true);
    this.errorMessage.set(null);

    const result = await this.loginUseCase.execute({
      email: this.form.value.email as string,
      password: this.form.value.password as string,
    });

    this.loading.set(false);

    result.fold(
      (failure) => {
        if (failure instanceof ValidationFailure) {
          this.errorMessage.set(failure.message);
        } else if (failure instanceof UnauthorizedFailure) {
          this.errorMessage.set(failure.message);
        } else if (failure instanceof NetworkFailure) {
          this.errorMessage.set('Sin conexión. Verifica tu red e intenta de nuevo.');
        } else if (failure instanceof ServerFailure) {
          this.errorMessage.set('Error del servidor. Intenta más tarde.');
        } else {
          this.errorMessage.set('Error inesperado. Intenta de nuevo.');
        }
      },
      (user) => {
        const destination = this.getDestinationForRole(user.role);
        this.router.navigate([destination]);
      },
    );
  }

  showFieldError(field: string): boolean {
    const control = this.form.get(field);
    return !!control && control.invalid && control.touched;
  }

  getFieldError(field: string): string {
    const control = this.form.get(field);
    return getErrorMessage(control?.errors ?? null);
  }

  private getDestinationForRole(role: UserRole): string {
    return role === 'admin' ? '/reports' : '/parking';
  }
}
