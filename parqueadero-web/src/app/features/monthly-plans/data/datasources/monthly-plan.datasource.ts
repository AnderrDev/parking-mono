import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import {
  CancelPlanOutcome, CreateMonthlyPlanParams, ListMonthlyPlansParams, UpdateMonthlyPlanParams,
} from '../../domain/repositories/monthly-plan.repository';

export abstract class MonthlyPlanDataSource {
  abstract list(params: ListMonthlyPlansParams): Promise<Either<Failure, { data: MonthlyPlanEntity[]; pagination: PaginationMeta }>>;
  abstract findById(id: string): Promise<Either<Failure, MonthlyPlanEntity>>;
  abstract createWithPayment(
    params: CreateMonthlyPlanParams,
    shiftId: string,
  ): Promise<Either<Failure, MonthlyPlanEntity>>;
  abstract update(params: UpdateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>>;
  abstract cancel(id: string): Promise<Either<Failure, CancelPlanOutcome>>;
  abstract hasActivePlanForPlate(plate: string, excludeId?: string): Promise<Either<Failure, boolean>>;
}
