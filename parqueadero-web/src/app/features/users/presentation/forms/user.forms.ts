import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserRole } from '../../../auth/domain/entities/user.entity';

@Injectable({ providedIn: 'root' })
export class UserForms {
  constructor(private readonly fb: FormBuilder) {}

  createCreateUserForm(): FormGroup {
    return this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
      role: ['operador' as UserRole, Validators.required],
    });
  }
}
