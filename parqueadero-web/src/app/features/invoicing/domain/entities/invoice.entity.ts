import { BaseEntity } from '../../../../core/base/base.entity';

export type DianStatus = 'pending' | 'sent' | 'accepted' | 'rejected' | 'contingency';
export type TipoDocumento = '01' | '02' | '91';

export class InvoiceEntity extends BaseEntity {
  constructor(
    id: string,
    createdAt: Date,
    updatedAt: Date,
    public readonly number: string,
    public readonly cufe: string | null,
    public readonly tipoDocumento: TipoDocumento,
    public readonly customerId: string,
    public readonly sessionId: string | null,
    public readonly paymentId: string | null,
    public readonly subtotalCents: number,
    public readonly taxCents: number,
    public readonly totalCents: number,
    public readonly dianStatus: DianStatus,
    public readonly dianCufe: string | null,
    public readonly dianXmlUrl: string | null,
    public readonly dianPdfUrl: string | null,
    public readonly issuedAt: Date,
    public readonly notes: string | null,
    public readonly isDeleted: boolean,
  ) {
    super(id, createdAt, updatedAt);
  }

  get isAccepted(): boolean {
    return this.dianStatus === 'accepted';
  }

  get canReissue(): boolean {
    return this.dianStatus === 'contingency' || this.dianStatus === 'rejected';
  }

  get hasDocuments(): boolean {
    return !!(this.dianXmlUrl || this.dianPdfUrl);
  }
}
