import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { COP_CASH_STEP_CENTS, isMultipleOfCopStep } from '../../utils/currency.utils';

/**
 * Valida que un monto en centavos sea múltiplo del paso físico de moneda
 * (default $50 = 5.000 cents). Permite null/empty (delegar a `required` si
 * aplica). Útil para valores de tarifas, topes diarios, planes mensuales:
 * en Colombia no existen monedas menores a $50, así que cobrar valores
 * que no sean múltiplos imposibilita el cambio físico.
 */
export function multipleOfCentsValidator(
  stepCents: number = COP_CASH_STEP_CENTS,
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as unknown;
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    if (Number.isNaN(num)) return null;
    return isMultipleOfCopStep(num, stepCents)
      ? null
      : { notMultipleOfCents: { stepCents } };
  };
}
