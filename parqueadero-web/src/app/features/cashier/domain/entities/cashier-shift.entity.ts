import { BaseEntity } from '../../../../core/base/base.entity';

export type CashierShiftStatus = 'open' | 'closed';

export class CashierShiftEntity extends BaseEntity {
  constructor(
    id: string,
    createdAt: Date,
    updatedAt: Date,
    public readonly userId: string,
    public readonly status: CashierShiftStatus,
    public readonly openingBalanceCents: number,
    public readonly openedAt: Date,
    public readonly closingBalanceCents: number | null,
    public readonly expectedBalanceCents: number | null,
    public readonly differenceCents: number | null,
    public readonly closedAt: Date | null,
    public readonly justification: string | null,
    public readonly isDeleted: boolean,
  ) {
    super(id, createdAt, updatedAt);
  }

  get isOpen(): boolean {
    return this.status === 'open';
  }
}
