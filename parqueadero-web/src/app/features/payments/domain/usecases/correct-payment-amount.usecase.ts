import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PAYMENT_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import {
  CorrectPaymentAmountParams,
  PaymentRepository,
} from '../repositories/payment.repository';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';

const MIN_REASON_LENGTH = 10;

@Injectable()
export class CorrectPaymentAmountUseCase extends UseCase<
  CorrectPaymentAmountParams,
  PaymentEntity
> {
  constructor(@Inject(PAYMENT_REPOSITORY_TOKEN) private readonly repo: PaymentRepository) {
    super();
  }

  execute(params: CorrectPaymentAmountParams): Promise<Either<Failure, PaymentEntity>> {
    if (!params.paymentId) {
      return Promise.resolve(left(new ValidationFailure('paymentId es requerido', 'paymentId')));
    }
    if (!params.userId) {
      return Promise.resolve(left(new ValidationFailure('Usuario requerido', 'userId')));
    }
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
      return Promise.resolve(
        left(new ValidationFailure('El monto debe ser mayor a $0. Para eliminar el cobro usa la anulación.', 'amountCents')),
      );
    }
    if ((params.reason ?? '').trim().length < MIN_REASON_LENGTH) {
      return Promise.resolve(
        left(
          new ValidationFailure(
            `El motivo de la corrección es obligatorio (mínimo ${MIN_REASON_LENGTH} caracteres)`,
            'reason',
          ),
        ),
      );
    }

    return this.repo.correctAmount({ ...params, reason: params.reason.trim() });
  }
}
