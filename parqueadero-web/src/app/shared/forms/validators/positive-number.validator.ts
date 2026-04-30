import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function positiveNumberValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as unknown;
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    if (isNaN(num)) return { notANumber: true };
    return num > 0 ? null : { notPositive: true };
  };
}
