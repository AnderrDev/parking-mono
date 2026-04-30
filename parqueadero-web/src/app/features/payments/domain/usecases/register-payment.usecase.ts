import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left } from '../../../../core/either/either';
import { BusinessRuleFailure, Failure, ValidationFailure } from '../../../../core/either/failures';
import { CASHIER_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { PaymentEntity, PaymentMethod, FREE_PAYMENT_METHODS } from '../../../parking/domain/entities/payment.entity';
import { PaymentRepository, CreatePaymentParams } from '../repositories/payment.repository';
import { CashierRepository } from '../../../cashier/domain/repositories/cashier.repository';

export interface RegisterPaymentParams {
  cashierShiftId: string;
  method: PaymentMethod;
  amountCents: number;
  invoiceId: string | null;
  gatewayRef: string | null;
  parkingSessionId: string | null;
}

@Injectable()
export class RegisterPaymentUseCase extends UseCase<RegisterPaymentParams, PaymentEntity> {
  constructor(
    @Inject(PAYMENT_REPOSITORY_TOKEN) private readonly paymentRepo: PaymentRepository,
    @Inject(CASHIER_REPOSITORY_TOKEN) private readonly cashierRepo: CashierRepository,
  ) {
    super();
  }

  async execute(params: RegisterPaymentParams): Promise<Either<Failure, PaymentEntity>> {
    if (params.amountCents < 0) {
      return left(new ValidationFailure('El monto debe ser ≥ 0'));
    }

    const isFreeMethod = (FREE_PAYMENT_METHODS as readonly string[]).includes(params.method);
    if (isFreeMethod && params.amountCents !== 0) {
      return left(new ValidationFailure('Cortesía/error/mensual deben tener monto = 0'));
    }
    if (!isFreeMethod && params.amountCents === 0) {
      return left(new ValidationFailure('El monto debe ser mayor a 0 para este método de pago'));
    }

    const shiftResult = await this.cashierRepo.findById(params.cashierShiftId);
    if (shiftResult.isLeft()) return left(shiftResult.value);
    const shift = shiftResult.value;
    if (!shift || shift.status !== 'open') {
      return left(new BusinessRuleFailure('No hay turno abierto. Abre tu turno antes de registrar pagos.'));
    }

    const createParams: CreatePaymentParams = {
      sessionId: params.parkingSessionId,
      cashierShiftId: params.cashierShiftId,
      method: params.method,
      amountCents: params.amountCents,
      invoiceId: params.invoiceId,
      gatewayRef: params.gatewayRef,
    };

    return this.paymentRepo.create(createParams);
  }
}
