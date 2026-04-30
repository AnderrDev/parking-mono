import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { MONTHLY_PLAN_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { MonthlyPlanRepository, CreateMonthlyPlanParams, ListMonthlyPlansParams, UpdateMonthlyPlanParams } from '../../domain/repositories/monthly-plan.repository';
import { MonthlyPlanDataSource } from '../datasources/monthly-plan.datasource';

@Injectable()
export class MonthlyPlanRepositoryImpl extends MonthlyPlanRepository {
  constructor(
    @Inject(MONTHLY_PLAN_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: MonthlyPlanDataSource,
  ) { super(); }

  list(params: ListMonthlyPlansParams): Promise<Either<Failure, { data: MonthlyPlanEntity[]; pagination: PaginationMeta }>> {
    return this.remoteDs.list(params);
  }
  findById(id: string): Promise<Either<Failure, MonthlyPlanEntity>> { return this.remoteDs.findById(id); }
  create(params: CreateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> { return this.remoteDs.create(params); }
  update(params: UpdateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> { return this.remoteDs.update(params); }
  cancel(id: string): Promise<Either<Failure, void>> { return this.remoteDs.cancel(id); }
  hasActivePlanForPlate(plate: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    return this.remoteDs.hasActivePlanForPlate(plate, excludeId);
  }
}
