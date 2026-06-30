import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left } from '../../../../core/either/either';
import { BusinessRuleFailure, Failure, ValidationFailure } from '../../../../core/either/failures';
import { CASHIER_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { CashierShiftEntity } from '../entities/cashier-shift.entity';
import { CashierRepository } from '../repositories/cashier.repository';

export interface OpenShiftParams {
  userId: string;
  openingBalanceCents: number;
}

@Injectable()
export class OpenShiftUseCase extends UseCase<OpenShiftParams, CashierShiftEntity> {
  constructor(@Inject(CASHIER_REPOSITORY_TOKEN) private readonly repo: CashierRepository) {
    super();
  }

  async execute(params: OpenShiftParams): Promise<Either<Failure, CashierShiftEntity>> {
    if (params.openingBalanceCents < 0) {
      return left(new ValidationFailure('El saldo inicial no puede ser negativo'));
    }

    const existing = await this.repo.findOpen();
    if (existing.isLeft()) return existing as Either<Failure, CashierShiftEntity>;
    if (existing.value !== null) {
      return left(new BusinessRuleFailure('Ya hay una caja abierta. Ciérrala antes de abrir una nueva.'));
    }

    return this.repo.create({
      userId: params.userId,
      openingBalanceCents: params.openingBalanceCents,
    });
  }
}
