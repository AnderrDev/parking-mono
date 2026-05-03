import { Inject, Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, ValidationFailure, BusinessRuleFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import {
  MONTHLY_PLAN_REPOSITORY_TOKEN,
  CUSTOMER_REPOSITORY_TOKEN,
  CASHIER_REPOSITORY_TOKEN,
  PAYMENT_REPOSITORY_TOKEN,
} from '../../../../core/di/injection-tokens';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { CustomerRepository } from '../../../customers/domain/repositories/customer.repository';
import { CashierRepository } from '../../../cashier/domain/repositories/cashier.repository';
import { PaymentRepository } from '../../../payments/domain/repositories/payment.repository';
import { MonthlyPlanRepository, CreateMonthlyPlanParams } from '../repositories/monthly-plan.repository';
import { isValidPlate } from '../../../../shared/utils/plate.utils';

const PLAN_TYPES = ['basico', 'premium', 'ilimitado'];

@Injectable()
export class CreateMonthlyPlanUseCase extends UseCase<CreateMonthlyPlanParams, MonthlyPlanEntity> {
  constructor(
    @Inject(MONTHLY_PLAN_REPOSITORY_TOKEN) private readonly repo: MonthlyPlanRepository,
    @Inject(CUSTOMER_REPOSITORY_TOKEN) private readonly customerRepo: CustomerRepository,
    @Inject(CASHIER_REPOSITORY_TOKEN) private readonly cashierRepo: CashierRepository,
    @Inject(PAYMENT_REPOSITORY_TOKEN) private readonly paymentRepo: PaymentRepository,
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

    const planResult = await this.repo.create({ ...params, vehiclePlate: plate });
    if (planResult.isLeft()) return planResult;
    const plan = planResult.value;

    // Registrar el ingreso en `payments` ligado al shift abierto. Si esto
    // falla, el plan ya fue creado (caso degenerado documentado en spec).
    // Mejora futura: RPC `create_plan_with_payment` para atomicidad real.
    const paymentResult = await this.paymentRepo.create({
      sessionId: null,
      cashierShiftId: shift.id,
      method: params.paymentMethod,
      amountCents: params.amountCents,
      invoiceId: null,
      gatewayRef: `monthly_plan:${plan.id}`,
    });
    if (paymentResult.isLeft()) {
      // No bloqueamos el éxito del plan; logueamos el problema al caller
      // como warning vía un wrap. Por simplicidad, devolvemos plan OK y
      // documentamos. El admin puede registrar el pago manualmente.
      console.warn('[CreateMonthlyPlan] Payment failed for plan', plan.id, paymentResult.value);
    }

    return right(plan);
  }
}
