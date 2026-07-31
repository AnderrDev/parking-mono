import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PAYMENT_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { PaymentRepository, PaymentWithVehicle } from '../repositories/payment.repository';

export interface ListShiftPaymentsParams {
  shiftId: string;
}

export type { PaymentWithVehicle };

/** Todos los pagos de un turno, sin paginar, con placa/hora de entrada de la sesión asociada — para el detalle expandible de un cierre de caja. */
@Injectable()
export class ListShiftPaymentsUseCase extends UseCase<ListShiftPaymentsParams, PaymentWithVehicle[]> {
  constructor(@Inject(PAYMENT_REPOSITORY_TOKEN) private readonly repo: PaymentRepository) {
    super();
  }

  async execute(params: ListShiftPaymentsParams): Promise<Either<Failure, PaymentWithVehicle[]>> {
    return this.repo.listByShiftWithVehicle(params.shiftId);
  }
}
