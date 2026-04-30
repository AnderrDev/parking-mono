import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure, BusinessRuleFailure, NotFoundFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { MONTHLY_PLAN_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { MonthlyPlanRepository, UpdateMonthlyPlanParams } from '../repositories/monthly-plan.repository';

@Injectable()
export class UpdateMonthlyPlanUseCase extends UseCase<UpdateMonthlyPlanParams, MonthlyPlanEntity> {
  constructor(@Inject(MONTHLY_PLAN_REPOSITORY_TOKEN) private readonly repo: MonthlyPlanRepository) {
    super();
  }

  async execute(params: UpdateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> {
    const existing = await this.repo.findById(params.id);
    if (existing.isLeft()) return existing as Either<Failure, never>;

    const plan = existing.value;
    if (plan.isDeleted) return left(new NotFoundFailure('Plan no encontrado'));
    if (plan.status === 'expired' || plan.status === 'cancelled') {
      return left(new BusinessRuleFailure('No se puede modificar un plan expirado o cancelado'));
    }

    if (params.endDate !== undefined) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = new Date(params.endDate);
      endDate.setHours(0, 0, 0, 0);
      if (endDate <= plan.startDate) {
        return left(new ValidationFailure('La fecha de fin debe ser posterior a la fecha de inicio'));
      }
      if (endDate <= today) {
        return left(new ValidationFailure('La fecha de fin debe ser posterior a hoy'));
      }
    }
    if (params.autoRenew && !params.paymentTokenId) {
      return left(new ValidationFailure('Se requiere un token de pago para habilitar la renovación automática'));
    }
    if (params.amountCents !== undefined && params.amountCents <= 0) {
      return left(new ValidationFailure('El valor del plan debe ser mayor que 0'));
    }

    return this.repo.update(params);
  }
}
