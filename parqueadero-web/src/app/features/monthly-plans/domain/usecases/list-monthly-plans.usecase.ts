import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { MONTHLY_PLAN_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { MonthlyPlanRepository, ListMonthlyPlansParams } from '../repositories/monthly-plan.repository';

export interface ListMonthlyPlansResult { data: MonthlyPlanEntity[]; pagination: PaginationMeta }

@Injectable()
export class ListMonthlyPlansUseCase extends UseCase<ListMonthlyPlansParams, ListMonthlyPlansResult> {
  constructor(@Inject(MONTHLY_PLAN_REPOSITORY_TOKEN) private readonly repo: MonthlyPlanRepository) {
    super();
  }

  async execute(params: ListMonthlyPlansParams): Promise<Either<Failure, ListMonthlyPlansResult>> {
    const page = params.pagination?.page ?? 1;
    const pageSize = params.pagination?.pageSize ?? 25;
    if (page < 1) return left(new ValidationFailure('La página debe ser ≥ 1'));
    if (pageSize < 10 || pageSize > 100) return left(new ValidationFailure('El tamaño de página debe estar entre 10 y 100'));
    return this.repo.list(params);
  }
}
