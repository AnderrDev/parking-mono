import { MonthlyPlanEntity, MonthlyPlanStatus } from '../../domain/entities/monthly-plan.entity';

export interface MonthlyPlanModel {
  id: string;
  vehicle_plate: string;
  customer_id: string;
  status: string;
  start_date: string;
  end_date: string;
  plan_type: string;
  amount_cents: number;
  auto_renew: boolean;
  payment_token_id: string | null;
  created_at: string;
  updated_at: string;
  _deleted: boolean;
}

export class MonthlyPlanMapper {
  static toEntity(m: MonthlyPlanModel): MonthlyPlanEntity {
    return new MonthlyPlanEntity(
      m.id,
      new Date(m.created_at),
      new Date(m.updated_at),
      m.vehicle_plate,
      m.customer_id,
      m.status as MonthlyPlanStatus,
      new Date(m.start_date),
      new Date(m.end_date),
      m.plan_type,
      m.amount_cents ?? 0,
      m.auto_renew ?? false,
      m.payment_token_id ?? null,
      m._deleted ?? false,
    );
  }
}
