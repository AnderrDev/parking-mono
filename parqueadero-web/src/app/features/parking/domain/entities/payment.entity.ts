import { BaseEntity } from '../../../../core/base/base.entity';

export type PaymentMethod =
  | 'efectivo'
  | 'tarjeta_credito'
  | 'tarjeta_debito'
  | 'transferencia'
  | 'nequi'
  | 'daviplata'
  | 'cortesia'
  | 'error'
  | 'mensual';

export type PaymentStatus = 'pending' | 'completed' | 'refunded';

export const FREE_PAYMENT_METHODS: readonly PaymentMethod[] = ['cortesia', 'error', 'mensual'];

/**
 * Métodos que NO pasan por el cajón físico: se verifican en cuentas/apps.
 * Clasificación spec: specs/features/cashier/close-shift.spec.md.
 */
export const DIGITAL_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'tarjeta_credito',
  'tarjeta_debito',
  'transferencia',
  'nequi',
  'daviplata',
];

export class PaymentEntity extends BaseEntity {
  constructor(
    id: string,
    createdAt: Date,
    updatedAt: Date,
    /**
     * ID de la sesión de parking asociada al pago.
     * `null` cuando el pago no proviene de una sesión (ej: venta de
     * mensualidad desde `/monthly-plans`, ajustes, otros cobros futuros).
     */
    public readonly sessionId: string | null,
    public readonly cashierShiftId: string,
    public readonly method: PaymentMethod,
    public readonly amountCents: number,
    public readonly status: PaymentStatus,
    public readonly paidAt: Date,
    public readonly justification: string | null,
    public readonly invoiceId: string | null,
    public readonly gatewayRef: string | null,
  ) {
    super(id, createdAt, updatedAt);
  }

  get isFree(): boolean {
    return this.amountCents === 0;
  }
}
