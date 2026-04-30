import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

function calcNitDv(nit: string): number {
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const digits = nit.split('').reverse();
  const sum = digits.reduce((acc, d, i) => {
    const w = weights[i] ?? 0;
    return acc + parseInt(d, 10) * w;
  }, 0);
  const remainder = sum % 11;
  if (remainder === 0) return 0;
  if (remainder === 1) return 1;
  return 11 - remainder;
}

export function nitValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as unknown;
    if (!value || typeof value !== 'string' || value.trim() === '') return null;

    const match = value.replace(/\s/g, '').match(/^(\d{7,12})-?(\d)$/);
    if (!match) return { invalidNit: true };

    const [, base, dvStr] = match;
    const expected = calcNitDv(base!);
    return parseInt(dvStr!, 10) === expected ? null : { invalidNitDv: true };
  };
}
