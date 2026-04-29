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
  template: `
    <div class="login-wrapper">
      <main class="login-card" aria-labelledby="login-title">
        <header class="login-card__header">
          <svg class="login-card__logo" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <rect width="40" height="40" rx="10" fill="var(--color-primary)"/>
            <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle"
              font-family="var(--font-sans)" font-weight="700" font-size="20" fill="#fff">P</text>
          </svg>
          <h1 id="login-title" class="login-card__title">Parqueadero</h1>
          <p class="login-card__subtitle">Ingresa tu cuenta para continuar</p>
        </header>

        <form
          class="login-card__form"
          [formGroup]="form"
          (ngSubmit)="onSubmit()"
          novalidate
        >
          <div class="field">
            <label class="field__label" for="email">Correo electrónico</label>
            <input
              id="email"
              class="field__input"
              [class.field__input--error]="showFieldError('email')"
              type="email"
              formControlName="email"
              autocomplete="email"
              inputmode="email"
              placeholder="operario@empresa.com"
              [attr.aria-describedby]="showFieldError('email') ? 'email-error' : null"
              [attr.aria-invalid]="showFieldError('email') ? 'true' : null"
            />
            @if (showFieldError('email')) {
              <span id="email-error" class="field__error" role="alert">
                {{ getFieldError('email') }}
              </span>
            }
          </div>

          <div class="field">
            <label class="field__label" for="password">Contraseña</label>
            <input
              id="password"
              class="field__input"
              [class.field__input--error]="showFieldError('password')"
              type="password"
              formControlName="password"
              autocomplete="current-password"
              placeholder="••••••"
              [attr.aria-describedby]="showFieldError('password') ? 'password-error' : null"
              [attr.aria-invalid]="showFieldError('password') ? 'true' : null"
            />
            @if (showFieldError('password')) {
              <span id="password-error" class="field__error" role="alert">
                {{ getFieldError('password') }}
              </span>
            }
          </div>

          @if (errorMessage()) {
            <app-error-display
              [message]="errorMessage()!"
              variant="inline"
            />
          }

          <button
            class="login-card__submit"
            type="submit"
            [disabled]="loading()"
          >
            @if (loading()) {
              <app-loading-spinner label="Iniciando sesión..." />
            } @else {
              Ingresar
            }
          </button>
        </form>
      </main>
    </div>
  `,
  styles: [`
    .login-wrapper {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg-subtle);
      padding: var(--space-4);
    }

    .login-card {
      width: 100%;
      max-width: 400px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl);
      padding: var(--space-8);
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      box-shadow: var(--shadow-md);
    }

    .login-card__header {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      text-align: center;
    }

    .login-card__logo {
      margin-bottom: var(--space-1);
    }

    .login-card__title {
      font-size: var(--text-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      margin: 0;
    }

    .login-card__subtitle {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin: 0;
    }

    .login-card__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .field__label {
      font-size: var(--text-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-primary);
    }

    .field__input {
      width: 100%;
      padding: var(--space-2) var(--space-3);
      font-size: var(--text-base);
      font-family: var(--font-sans);
      color: var(--color-text-primary);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      transition: border-color var(--motion-duration-fast) var(--motion-easing-standard);
      box-sizing: border-box;
      min-height: var(--touch-target-min);

      &::placeholder {
        color: var(--color-text-placeholder);
      }

      &:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .field__input--error {
      border-color: var(--color-danger);

      &:focus {
        border-color: var(--color-danger);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-danger) 20%, transparent);
      }
    }

    .field__error {
      font-size: var(--text-xs);
      color: var(--color-danger);
    }

    .login-card__submit {
      width: 100%;
      min-height: var(--touch-target-min);
      padding: var(--space-3);
      background: var(--color-primary);
      color: #fff;
      font-size: var(--text-base);
      font-weight: var(--font-weight-semibold);
      font-family: var(--font-sans);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: background var(--motion-duration-fast) var(--motion-easing-standard);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);

      &:hover:not(:disabled) {
        background: var(--color-primary-hover);
      }

      &:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }

      &:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }
    }
  `],
})
export class LoginPageComponent implements OnInit {
  form!: FormGroup;
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

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
