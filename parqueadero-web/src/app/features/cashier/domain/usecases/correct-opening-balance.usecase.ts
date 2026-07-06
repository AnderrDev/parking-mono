import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { CASHIER_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import {
  CashierRepository,
  CorrectOpeningBalanceParams,
} from '../repositories/cashier.repository';
import { CashierShiftEntity } from '../entities/cashier-shift.entity';

@Injectable()
export class CorrectOpeningBalanceUseCase extends UseCase<
  CorrectOpeningBalanceParams,
  CashierShiftEntity
> {
  constructor(@Inject(CASHIER_REPOSITORY_TOKEN) private readonly repo: CashierRepository) {
    super();
  }

  execute(params: CorrectOpeningBalanceParams): Promise<Either<Failure, CashierShiftEntity>> {
    if (!params.shiftId) {
      return Promise.resolve(left(new ValidationFailure('shiftId es requerido', 'shiftId')));
    }
    if (!params.userId) {
      return Promise.resolve(left(new ValidationFailure('Usuario requerido', 'userId')));
    }
    if (params.openingBalanceCents < 0) {
      return Promise.resolve(left(new ValidationFailure('El saldo inicial no puede ser negativo')));
    }

    return this.repo.correctOpeningBalance(params);
  }
}
