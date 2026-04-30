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

export class PaymentEntity extends BaseEntity {
  constructor(
    id: string,
    createdAt: Date,
    updatedAt: Date,
    public readonly sessionId: string,
    public readonly cashierShiftId: string,
    public readonly method: PaymentMethod,
    public readonly amountCents: number,
    public readonly status: PaymentStatus,
    public readonly paidAt: Date,
    public readonly justification: string | null,
    public readonly invoiceId: string | null,
  ) {
    super(id, createdAt, updatedAt);
  }

  get isFree(): boolean {
    return this.amountCents === 0;
  }
}
