import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PAYMENT_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import {
  CorrectPaymentMethodParams,
  PaymentRepository,
} from '../repositories/payment.repository';
import { PaymentEntity, PaymentMethod } from '../../../parking/domain/entities/payment.entity';

const ALLOWED_METHODS: readonly PaymentMethod[] = [
  'efectivo',
  'tarjeta_credito',
  'tarjeta_debito',
  'transferencia',
  'nequi',
  'daviplata',
];

@Injectable()
export class CorrectPaymentMethodUseCase extends UseCase<
  CorrectPaymentMethodParams,
  PaymentEntity
> {
  constructor(@Inject(PAYMENT_REPOSITORY_TOKEN) private readonly repo: PaymentRepository) {
    super();
  }

  execute(params: CorrectPaymentMethodParams): Promise<Either<Failure, PaymentEntity>> {
    if (!params.paymentId) {
      return Promise.resolve(left(new ValidationFailure('paymentId es requerido', 'paymentId')));
    }
    if (!params.userId) {
      return Promise.resolve(left(new ValidationFailure('Usuario requerido', 'userId')));
    }
    if (!ALLOWED_METHODS.includes(params.method)) {
      return Promise.resolve(left(new ValidationFailure('Método de pago inválido', 'method')));
    }

    return this.repo.correctMethod(params);
  }
}
