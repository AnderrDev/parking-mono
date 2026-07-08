import { BaseEntity } from '../../../../core/base/base.entity';

export type CashierShiftStatus = 'open' | 'closed';

/** Fila del snapshot de pagos por método persistido al cierre. */
export interface ShiftMethodTotal {
  method: string;
  count: number;
  amountCents: number;
}

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
    /** Σ pagos en efectivo al cierre. null = turno abierto o cerrado antes del desglose. */
    public readonly cashCollectedCents: number | null = null,
    /** Σ pagos digitales (transferencia/nequi/daviplata/tarjetas) al cierre. */
    public readonly digitalCollectedCents: number | null = null,
    /** Total digital verificado por el operador en cuentas. null = no verificado. */
    public readonly digitalVerifiedCents: number | null = null,
    /** Snapshot por método al cierre; null en turnos previos al desglose. */
    public readonly totalsByMethod: ShiftMethodTotal[] | null = null,
  ) {
    super(id, createdAt, updatedAt);
  }

  get isOpen(): boolean {
    return this.status === 'open';
  }

  /** true cuando el turno cerró con desglose por método persistido. */
  get hasBreakdown(): boolean {
    return this.totalsByMethod !== null;
  }

  /** Diferencia digital (verificado − recibido); null si el operador no verificó. */
  get digitalDifferenceCents(): number | null {
    if (this.digitalVerifiedCents === null || this.digitalCollectedCents === null) {
      return null;
    }
    return this.digitalVerifiedCents - this.digitalCollectedCents;
  }
}
