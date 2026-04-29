import { MonthlyPlanEntity, MonthlyPlanStatus } from '../../domain/entities/monthly-plan.entity';

export interface MonthlyPlanModel {
  id: string;
  vehicle_plate: string;
  customer_id: string;
  status: string;
  start_date: string;
  end_date: string;
  plan_type: string;
  created_at: string;
  updated_at: string;
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
    );
  }
}
