import { BaseEntity } from '../../../../core/base/base.entity';

export class CashWithdrawalEntity extends BaseEntity {
  constructor(
    id: string,
    createdAt: Date,
    updatedAt: Date,
    public readonly shiftId: string,
    public readonly userId: string,
    public readonly amountCents: number,
    public readonly recipient: string,
    public readonly justification: string,
    public readonly withdrawnAt: Date,
    public readonly movementType: 'in' | 'out' = 'out',
  ) {
    super(id, createdAt, updatedAt);
  }
}
