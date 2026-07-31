import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PAYMENT_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';
import { PaymentRepository } from '../repositories/payment.repository';

export interface ListShiftPaymentsParams {
  shiftId: string;
}

/** Todos los pagos de un turno, sin paginar — para el detalle expandible de un cierre de caja. */
@Injectable()
export class ListShiftPaymentsUseCase extends UseCase<ListShiftPaymentsParams, PaymentEntity[]> {
  constructor(@Inject(PAYMENT_REPOSITORY_TOKEN) private readonly repo: PaymentRepository) {
    super();
  }

  async execute(params: ListShiftPaymentsParams): Promise<Either<Failure, PaymentEntity[]>> {
    return this.repo.listByShift(params.shiftId);
  }
}
