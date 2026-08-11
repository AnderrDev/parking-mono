import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure, BusinessRuleFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import {
  MONTHLY_PLAN_REPOSITORY_TOKEN,
  CUSTOMER_REPOSITORY_TOKEN,
  CASHIER_REPOSITORY_TOKEN,
} from '../../../../core/di/injection-tokens';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { CustomerRepository } from '../../../customers/domain/repositories/customer.repository';
import { CashierRepository } from '../../../cashier/domain/repositories/cashier.repository';
import { MonthlyPlanRepository, CreateMonthlyPlanParams } from '../repositories/monthly-plan.repository';
import { isValidPlate, normalizePlate } from '../../../../shared/utils/plate.utils';

const PLAN_TYPES = ['basico', 'premium', 'ilimitado'];

@Injectable()
export class CreateMonthlyPlanUseCase extends UseCase<CreateMonthlyPlanParams, MonthlyPlanEntity> {
  constructor(
    @Inject(MONTHLY_PLAN_REPOSITORY_TOKEN) private readonly repo: MonthlyPlanRepository,
    @Inject(CUSTOMER_REPOSITORY_TOKEN) private readonly customerRepo: CustomerRepository,
    @Inject(CASHIER_REPOSITORY_TOKEN) private readonly cashierRepo: CashierRepository,
  ) { super(); }

  async execute(params: CreateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> {
    const rawPlate = params.vehiclePlate ?? '';

    if (!isValidPlate(rawPlate)) {
      return left(new ValidationFailure('Formato de placa inválido'));
    }
    const plate = normalizePlate(rawPlate);
    if (!PLAN_TYPES.includes(params.planType)) {
      return left(new ValidationFailure('Tipo de plan inválido. Use: basico, premium o ilimitado'));
    }
    if (params.amountCents <= 0) {
      return left(new ValidationFailure('El valor del plan debe ser mayor que 0'));
    }

    // Validar caja abierta — el ingreso por mensualidad se registra en el
    // shift activo del usuario para reflejarse en el cuadre del turno.
    const shiftResult = await this.cashierRepo.findOpenByUser(params.userId);
    if (shiftResult.isLeft()) return shiftResult as Either<Failure, never>;
    const shift = shiftResult.value;
    if (!shift) {
      return left(new BusinessRuleFailure(
        'No hay caja abierta. Abre un turno antes de vender mensualidades.',
      ));
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

    const customerResult = await this.customerRepo.findById(params.customerId);
    if (customerResult.isLeft()) return customerResult as Either<Failure, never>;
    if (customerResult.value.isDeleted) {
      return left(new ValidationFailure('Cliente no encontrado'));
    }

    // Chequeo temprano solo para dar un mensaje claro antes de ir al
    // servidor. La garantía real es la constraint `monthly_plans_no_overlap`,
    // que la RPC traduce a `plan_overlap`: entre este SELECT y el INSERT
    // cabe otra venta de la misma placa.
    const hasActive = await this.repo.hasActivePlanForPlate(plate);
    if (hasActive.isLeft()) return hasActive as Either<Failure, never>;
    if (hasActive.value) {
      return left(new BusinessRuleFailure(`La placa ${plate} ya tiene un plan activo que se solapa con las fechas indicadas`));
    }

    // Plan e ingreso en una sola transacción: o quedan ambos, o ninguno.
    // Antes se insertaban por separado y el fallo del pago se tragaba con
    // un console.warn, dejando la mensualidad vendida y la plata fuera de
    // la caja sin ningún rastro visible.
    return this.repo.createWithPayment({ ...params, vehiclePlate: plate }, shift.id);
  }
}
