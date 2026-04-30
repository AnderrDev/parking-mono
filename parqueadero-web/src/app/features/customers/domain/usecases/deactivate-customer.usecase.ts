import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, BusinessRuleFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { CUSTOMER_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { CustomerRepository } from '../repositories/customer.repository';

export interface DeactivateCustomerParams { id: string; }

@Injectable()
export class DeactivateCustomerUseCase extends UseCase<DeactivateCustomerParams, void> {
  constructor(@Inject(CUSTOMER_REPOSITORY_TOKEN) private readonly repo: CustomerRepository) {
    super();
  }

  async execute(params: DeactivateCustomerParams): Promise<Either<Failure, void>> {
    const existing = await this.repo.findById(params.id);
    if (existing.isLeft()) return existing as Either<Failure, never>;
    if (existing.value.isDeleted) return left(new BusinessRuleFailure('El cliente ya está desactivado'));

    const activePlans = await this.repo.countActiveMonthlyPlans(params.id);
    if (activePlans.isLeft()) return activePlans as Either<Failure, never>;
    if (activePlans.value > 0) {
      return left(new BusinessRuleFailure('El cliente tiene planes mensuales activos. Cancélalos antes de desactivar.'));
    }

    return this.repo.deactivate(params.id);
  }
}
