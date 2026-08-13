import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure, BusinessRuleFailure, NotFoundFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { MONTHLY_PLAN_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { MonthlyPlanRepository, UpdateMonthlyPlanParams } from '../repositories/monthly-plan.repository';
import { todayDateOnlyBogota } from '../../../../shared/utils/date.utils';

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
      // Día civil de Colombia, no la medianoche de la máquina: con el reloj
      // del equipo en UTC, después de las 19:00 de Bogotá "hoy" ya era el
      // día siguiente y rechazaba vigencias válidas.
      const today = todayDateOnlyBogota();
      const endDate = new Date(params.endDate);
      endDate.setHours(0, 0, 0, 0);
      if (endDate <= plan.startDate) {
        return left(new ValidationFailure('La fecha de fin debe ser posterior a la fecha de inicio'));
      }
      // `<` y no `<=`: un plan que vence hoy sigue vigente todo el día, igual
      // que en `isCurrentlyActive` y en la venta. Recortar la vigencia a hoy
      // es una edición legítima.
      if (endDate < today) {
        return left(new ValidationFailure('La fecha de fin no puede ser anterior a hoy'));
      }
    }
    if (params.amountCents !== undefined && params.amountCents <= 0) {
      return left(new ValidationFailure('El valor del plan debe ser mayor que 0'));
    }

    return this.repo.update(params);
  }
}
