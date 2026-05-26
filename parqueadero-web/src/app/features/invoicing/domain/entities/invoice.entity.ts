import { BaseEntity } from '../../../../core/base/base.entity';

export type TipoDocumento = '01' | '02' | '91';

export class InvoiceEntity extends BaseEntity {
  constructor(
    id: string,
    createdAt: Date,
    updatedAt: Date,
    public readonly internalNumber: string,
    public readonly tipoDocumento: TipoDocumento,
    public readonly customerId: string,
    public readonly sessionId: string | null,
    public readonly paymentId: string | null,
    public readonly subtotalCents: number,
    public readonly taxCents: number,
    public readonly totalCents: number,
    public readonly issuedAt: Date,
    public readonly notes: string | null,
    public readonly isDeleted: boolean,
  ) {
    super(id, createdAt, updatedAt);
  }
}
