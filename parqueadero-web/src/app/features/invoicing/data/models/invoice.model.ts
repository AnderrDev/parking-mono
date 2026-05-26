import { InvoiceEntity, TipoDocumento } from '../../domain/entities/invoice.entity';

export interface InvoiceModel {
  id: string;
  internal_number: string;
  tipo_documento: string;
  customer_id: string;
  session_id: string | null;
  payment_id: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  issued_at: string;
  notes: string | null;
  _deleted: boolean;
  created_at: string;
  updated_at: string;
}

export class InvoiceMapper {
  static toEntity(m: InvoiceModel): InvoiceEntity {
    return new InvoiceEntity(
      m.id,
      new Date(m.created_at),
      new Date(m.updated_at),
      m.internal_number,
      m.tipo_documento as TipoDocumento,
      m.customer_id,
      m.session_id,
      m.payment_id,
      m.subtotal_cents,
      m.tax_cents,
      m.total_cents,
      new Date(m.issued_at),
      m.notes,
      m._deleted,
    );
  }
}
