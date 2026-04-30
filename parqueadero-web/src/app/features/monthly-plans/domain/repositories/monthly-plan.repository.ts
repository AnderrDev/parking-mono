import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { SortParams } from '../../../../shared/models/sort.model';
import { MonthlyPlanEntity, MonthlyPlanStatus } from '../../../parking/domain/entities/monthly-plan.entity';

export interface ListMonthlyPlansParams {
  search?: string | null;
  status?: MonthlyPlanStatus | null;
  customerId?: string | null;
  pagination?: { page: number; pageSize: number };
  sort?: SortParams;
}

export interface CreateMonthlyPlanParams {
  vehiclePlate: string;
  customerId: string;
  planType: string;
  startDate: Date;
  endDate: Date;
  amountCents: number;
  autoRenew?: boolean;
  paymentTokenId?: string | null;
}

export interface UpdateMonthlyPlanParams {
  id: string;
  endDate?: Date;
  autoRenew?: boolean;
  paymentTokenId?: string | null;
  amountCents?: number;
}

export abstract class MonthlyPlanRepository {
  abstract list(params: ListMonthlyPlansParams): Promise<Either<Failure, { data: MonthlyPlanEntity[]; pagination: PaginationMeta }>>;
  abstract findById(id: string): Promise<Either<Failure, MonthlyPlanEntity>>;
  abstract create(params: CreateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>>;
  abstract update(params: UpdateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>>;
  abstract cancel(id: string): Promise<Either<Failure, void>>;
  abstract hasActivePlanForPlate(plate: string, excludeId?: string): Promise<Either<Failure, boolean>>;
}
