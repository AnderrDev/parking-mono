import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isValidPlate, normalizePlate } from '../../utils/plate.utils';

export function plateValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as unknown;
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    return isValidPlate(normalizePlate(value)) ? null : { invalidPlate: true };
  };
}
