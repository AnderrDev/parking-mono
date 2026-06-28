import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { PAYMENT_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';
import { PaymentRepository } from '../repositories/payment.repository';

export interface VoidPaymentUseCaseParams {
  paymentId: string;
  reason: string;
}

@Injectable()
export class VoidPaymentUseCase extends UseCase<VoidPaymentUseCaseParams, PaymentEntity> {
  constructor(@Inject(PAYMENT_REPOSITORY_TOKEN) private readonly repo: PaymentRepository) {
    super();
  }

  async execute(params: VoidPaymentUseCaseParams): Promise<Either<Failure, PaymentEntity>> {
    const reason = params.reason?.trim() ?? '';
    if (!params.paymentId) {
      return left(new ValidationFailure('paymentId es requerido', 'paymentId'));
    }
    if (reason.length < 10) {
      return left(new ValidationFailure('El motivo de anulación debe tener al menos 10 caracteres', 'reason'));
    }
    return this.repo.voidPayment({ paymentId: params.paymentId, reason });
  }
}
