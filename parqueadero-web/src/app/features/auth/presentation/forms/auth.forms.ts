import { Injectable } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

@Injectable({ providedIn: 'root' })
export class AuthForms {
  constructor(private readonly fb: FormBuilder) {}

  createLoginForm(): FormGroup {
    // DEV-ONLY: prefill con credenciales del admin de dev (proyecto Supabase
    // hhwctcjwrlbqgsrfriqn). Quitar antes del build productivo o reemplazar
    // por valores vacíos en `auth.forms.prod.ts` vía fileReplacements.
    return this.fb.group({
      email: ['admin@parqueadero.com', [Validators.required, Validators.email]],
      password: ['ParqueaderoAdmin2026!', [Validators.required, Validators.minLength(6)]],
    });
  }

  createChangePasswordForm(): FormGroup {
    return this.fb.group(
      {
        currentPassword: ['', Validators.required],
        newPassword: [
          '',
          [
            Validators.required,
            Validators.minLength(8),
            Validators.maxLength(72),
            Validators.pattern(/[A-Z]/),
            Validators.pattern(/[a-z]/),
            Validators.pattern(/\d/),
          ],
        ],
        confirmation: ['', Validators.required],
      },
      { validators: [matchValidator('newPassword', 'confirmation'), differentValidator('currentPassword', 'newPassword')] },
    );
  }
}

function matchValidator(a: string, b: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const va = group.get(a)?.value;
    const vb = group.get(b)?.value;
    if (!va || !vb) return null;
    return va === vb ? null : { passwordsDoNotMatch: true };
  };
}

function differentValidator(a: string, b: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const va = group.get(a)?.value;
    const vb = group.get(b)?.value;
    if (!va || !vb) return null;
    return va !== vb ? null : { passwordMustDiffer: true };
  };
}
