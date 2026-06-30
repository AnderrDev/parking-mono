import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { CASHIER_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import {
  CashierRepository,
  RegisterWithdrawalParams,
} from '../repositories/cashier.repository';
import { CashWithdrawalEntity } from '../entities/cash-withdrawal.entity';

@Injectable()
export class RegisterCashWithdrawalUseCase extends UseCase<
  RegisterWithdrawalParams,
  CashWithdrawalEntity
> {
  constructor(
    @Inject(CASHIER_REPOSITORY_TOKEN) private readonly repo: CashierRepository,
  ) {
    super();
  }

  async execute(
    params: RegisterWithdrawalParams,
  ): Promise<Either<Failure, CashWithdrawalEntity>> {
    if (params.amountCents <= 0) {
      return left(new ValidationFailure('El monto debe ser mayor a cero', 'amountCents'));
    }
    const recipient = params.recipient?.trim() ?? '';
    if (recipient.length < 3) {
      return left(new ValidationFailure('Indica el origen o destino del efectivo', 'recipient'));
    }
    const justification = params.justification?.trim() ?? '';
    if (justification.length < 5) {
      return left(
        new ValidationFailure('La justificación debe tener al menos 5 caracteres', 'justification'),
      );
    }
    return this.repo.registerWithdrawal({ ...params, recipient, justification });
  }
}
