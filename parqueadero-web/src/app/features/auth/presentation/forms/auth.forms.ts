import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Injectable({ providedIn: 'root' })
export class AuthForms {
  constructor(private readonly fb: FormBuilder) {}

  createLoginForm(): FormGroup {
    return this.fb.group({
      email: ['admin@parqueadero.local', [Validators.required, Validators.email]],
      password: ['admin12345', [Validators.required, Validators.minLength(6)]],
    });
  }
}
