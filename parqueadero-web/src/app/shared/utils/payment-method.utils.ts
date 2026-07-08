import {
  DIGITAL_PAYMENT_METHODS,
  FREE_PAYMENT_METHODS,
} from '../../features/parking/domain/entities/payment.entity';

/** Copy en español para cada método de pago (POS Colombia). */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta_credito: 'Tarjeta crédito',
  tarjeta_debito: 'Tarjeta débito',
  transferencia: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  cortesia: 'Cortesía',
  error: 'Error',
  mensual: 'Plan mensual',
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

export type PaymentChannel = 'cash' | 'digital' | 'free';

/** Canal de cuadre al que pertenece un método (spec cashier/close-shift). */
export function paymentChannel(method: string): PaymentChannel {
  if (method === 'efectivo') return 'cash';
  if ((DIGITAL_PAYMENT_METHODS as readonly string[]).includes(method)) return 'digital';
  if ((FREE_PAYMENT_METHODS as readonly string[]).includes(method)) return 'free';
  // Métodos desconocidos (futuros) se tratan como digitales: no están en el cajón.
  return 'digital';
}
