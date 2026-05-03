import { ValidationErrors } from '@angular/forms';

const MESSAGES: Record<string, string> = {
  required: 'Este campo es obligatorio',
  minlength: 'El valor es demasiado corto',
  maxlength: 'El valor es demasiado largo',
  min: 'El valor es menor al mínimo permitido',
  max: 'El valor es mayor al máximo permitido',
  email: 'Ingresa un correo electrónico válido',
  pattern: 'El formato no es válido',
  invalidPlate: 'La placa no es válida (formato: ABC123 o ABC12D)',
  invalidNit: 'El NIT no tiene el formato correcto (ej: 900123456-7)',
  invalidNitDv: 'El dígito de verificación del NIT no coincide',
  invalidColombianPhone: 'Ingresa un celular colombiano válido (ej: 3001234567)',
  notANumber: 'Debe ser un número',
  notPositive: 'Debe ser un número mayor a cero',
  notMultipleOfCents: 'El valor debe ser múltiplo de $50',
  passwordsDoNotMatch: 'La nueva contraseña y la confirmación no coinciden',
  passwordMustDiffer: 'La nueva contraseña debe ser distinta a la actual',
};

export function getErrorMessage(errors: ValidationErrors | null): string {
  if (!errors) return '';
  const firstKey = Object.keys(errors)[0];
  if (!firstKey) return '';
  return MESSAGES[firstKey] ?? `Error de validación: ${firstKey}`;
}
