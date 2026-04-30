import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// Colombia: celular 3XXXXXXXXX (10 dígitos, empieza en 3) o fijo con indicativo
const MOBILE_RE = /^3\d{9}$/;

export function colombianPhoneValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as unknown;
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    const digits = value.replace(/\D/g, '');
    return MOBILE_RE.test(digits) ? null : { invalidColombianPhone: true };
  };
}
