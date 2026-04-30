import { PaymentEntity, PaymentMethod, PaymentStatus } from '../../domain/entities/payment.entity';

export interface PaymentModel {
  id: string;
  session_id: string;
  cashier_shift_id: string;
  method: string;
  amount_cents: number;
  status: string;
  paid_at: string;
  justification: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
}

export class PaymentMapper {
  static toEntity(m: PaymentModel): PaymentEntity {
    return new PaymentEntity(
      m.id,
      new Date(m.created_at),
      new Date(m.updated_at),
      m.session_id,
      m.cashier_shift_id,
      m.method as PaymentMethod,
      m.amount_cents,
      m.status as PaymentStatus,
      new Date(m.paid_at),
      m.justification,
      m.invoice_id,
    );
  }
}
