import { BaseEntity } from '../../../../core/base/base.entity';

export type MonthlyPlanStatus = 'active' | 'expiring' | 'expired' | 'cancelled';

export class MonthlyPlanEntity extends BaseEntity {
  constructor(
    id: string,
    createdAt: Date,
    updatedAt: Date,
    public readonly vehiclePlate: string,
    public readonly customerId: string,
    public readonly status: MonthlyPlanStatus,
    public readonly startDate: Date,
    public readonly endDate: Date,
    public readonly planType: string,
    public readonly amountCents = 0,
    public readonly autoRenew = false,
    public readonly paymentTokenId: string | null = null,
    public readonly isDeleted = false,
  ) {
    super(id, createdAt, updatedAt);
  }

  get isCurrentlyActive(): boolean {
    const now = new Date();
    return (
      (this.status === 'active' || this.status === 'expiring') &&
      now >= this.startDate &&
      now <= this.endDate
    );
  }

  get daysUntilExpiry(): number {
    const now = new Date();
    return Math.ceil((this.endDate.getTime() - now.getTime()) / 86_400_000);
  }
}
