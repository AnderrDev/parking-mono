import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, BusinessRuleFailure, NotFoundFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { MONTHLY_PLAN_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { CancelPlanOutcome, MonthlyPlanRepository } from '../repositories/monthly-plan.repository';

export interface CancelMonthlyPlanParams { id: string; }

@Injectable()
export class CancelMonthlyPlanUseCase extends UseCase<CancelMonthlyPlanParams, CancelPlanOutcome> {
  constructor(@Inject(MONTHLY_PLAN_REPOSITORY_TOKEN) private readonly repo: MonthlyPlanRepository) {
    super();
  }

  async execute(params: CancelMonthlyPlanParams): Promise<Either<Failure, CancelPlanOutcome>> {
    const existing = await this.repo.findById(params.id);
    if (existing.isLeft()) return existing as Either<Failure, never>;

    const plan = existing.value;
    if (plan.isDeleted) return left(new NotFoundFailure('Plan no encontrado'));
    if (plan.status === 'expired' || plan.status === 'cancelled') {
      return left(new BusinessRuleFailure('El plan ya está cancelado o expirado'));
    }

    return this.repo.cancel(params.id);
  }
}
