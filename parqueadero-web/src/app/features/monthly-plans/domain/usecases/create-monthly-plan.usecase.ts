import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure, BusinessRuleFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { MONTHLY_PLAN_REPOSITORY_TOKEN, CUSTOMER_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { CustomerRepository } from '../../../customers/domain/repositories/customer.repository';
import { MonthlyPlanRepository, CreateMonthlyPlanParams } from '../repositories/monthly-plan.repository';
import { isValidPlate } from '../../../../shared/utils/plate.utils';

const PLAN_TYPES = ['basico', 'premium', 'ilimitado'];

@Injectable()
export class CreateMonthlyPlanUseCase extends UseCase<CreateMonthlyPlanParams, MonthlyPlanEntity> {
  constructor(
    @Inject(MONTHLY_PLAN_REPOSITORY_TOKEN) private readonly repo: MonthlyPlanRepository,
    @Inject(CUSTOMER_REPOSITORY_TOKEN) private readonly customerRepo: CustomerRepository,
  ) { super(); }

  async execute(params: CreateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> {
    const plate = params.vehiclePlate.trim().toUpperCase();

    if (!isValidPlate(plate)) {
      return left(new ValidationFailure('Formato de placa inválido'));
    }
    if (!PLAN_TYPES.includes(params.planType)) {
      return left(new ValidationFailure('Tipo de plan inválido. Use: basico, premium o ilimitado'));
    }
    if (params.amountCents <= 0) {
      return left(new ValidationFailure('El valor del plan debe ser mayor que 0'));
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(params.startDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(params.endDate);
    endDate.setHours(0, 0, 0, 0);

    if (startDate < today) {
      return left(new ValidationFailure('La fecha de inicio no puede ser anterior a hoy'));
    }
    if (endDate <= startDate) {
      return left(new ValidationFailure('La fecha de fin debe ser posterior a la fecha de inicio'));
    }
    if (params.autoRenew && !params.paymentTokenId) {
      return left(new ValidationFailure('Se requiere un token de pago para habilitar la renovación automática'));
    }

    const customerResult = await this.customerRepo.findById(params.customerId);
    if (customerResult.isLeft()) return customerResult as Either<Failure, never>;
    if (customerResult.value.isDeleted) {
      return left(new ValidationFailure('Cliente no encontrado'));
    }

    const hasActive = await this.repo.hasActivePlanForPlate(plate);
    if (hasActive.isLeft()) return hasActive as Either<Failure, never>;
    if (hasActive.value) {
      return left(new BusinessRuleFailure(`La placa ${plate} ya tiene un plan activo que se solapa con las fechas indicadas`));
    }

    return this.repo.create({ ...params, vehiclePlate: plate });
  }
}
