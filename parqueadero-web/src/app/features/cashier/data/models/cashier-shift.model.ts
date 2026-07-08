import {
  CashierShiftEntity,
  CashierShiftStatus,
  ShiftMethodTotal,
} from '../../domain/entities/cashier-shift.entity';

/** Fila del snapshot `totals_by_method` (jsonb) tal como viene de Supabase. */
export interface ShiftMethodTotalModel {
  method: string;
  count: number;
  amount_cents: number;
}

export interface CashierShiftModel {
  id: string;
  user_id: string;
  status: string;
  opening_balance_cents: number;
  opened_at: string;
  closing_balance_cents: number | null;
  expected_balance_cents: number | null;
  difference_cents: number | null;
  closed_at: string | null;
  justification: string | null;
  cash_collected_cents?: number | null;
  digital_collected_cents?: number | null;
  digital_verified_cents?: number | null;
  totals_by_method?: ShiftMethodTotalModel[] | null;
  _deleted: boolean;
  created_at: string;
  updated_at: string;
}

export class CashierShiftMapper {
  static toEntity(m: CashierShiftModel): CashierShiftEntity {
    return new CashierShiftEntity(
      m.id,
      new Date(m.created_at),
      new Date(m.updated_at),
      m.user_id,
      m.status as CashierShiftStatus,
      m.opening_balance_cents,
      new Date(m.opened_at),
      m.closing_balance_cents,
      m.expected_balance_cents,
      m.difference_cents,
      m.closed_at ? new Date(m.closed_at) : null,
      m.justification,
      m._deleted,
      m.cash_collected_cents ?? null,
      m.digital_collected_cents ?? null,
      m.digital_verified_cents ?? null,
      CashierShiftMapper.totalsToEntity(m.totals_by_method),
    );
  }

  private static totalsToEntity(
    totals: ShiftMethodTotalModel[] | null | undefined,
  ): ShiftMethodTotal[] | null {
    if (!totals) return null;
    return totals.map((t) => ({
      method: t.method,
      count: t.count,
      amountCents: t.amount_cents,
    }));
  }
}
