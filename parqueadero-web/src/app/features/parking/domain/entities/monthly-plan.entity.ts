import { BaseEntity } from '../../../../core/base/base.entity';
import { todayDateOnlyBogota } from '../../../../shared/utils/date.utils';

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
    // Espejo de columnas que siguen en la BD pero ya no se usan: la
    // renovación automática se retiró el 2026-08-11 (nada la implementaba).
    // Se conservan para no romper el mapeo de filas existentes.
    public readonly autoRenew = false,
    public readonly paymentTokenId: string | null = null,
    public readonly isDeleted = false,
  ) {
    super(id, createdAt, updatedAt);
  }

  /**
   * La vigencia se compara por DÍA CALENDARIO, no por instante: `startDate`
   * y `endDate` vienen de columnas DATE y ambos extremos son inclusivos.
   * Comparar contra `new Date()` (un instante) haría que el plan muriera a
   * media jornada de su último día.
   */
  get isCurrentlyActive(): boolean {
    const today = todayDateOnlyBogota();
    return (
      (this.status === 'active' || this.status === 'expiring') &&
      this.startDate <= today &&
      today <= this.endDate
    );
  }

  /** Días completos que faltan para el vencimiento. 0 = vence hoy. */
  get daysUntilExpiry(): number {
    const today = todayDateOnlyBogota();
    return Math.round((this.endDate.getTime() - today.getTime()) / 86_400_000);
  }
}
