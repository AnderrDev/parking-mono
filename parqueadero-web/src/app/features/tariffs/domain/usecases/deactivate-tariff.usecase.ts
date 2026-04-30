import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, BusinessRuleFailure, NotFoundFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { TariffRepository } from '../repositories/tariff.repository';
import { TARIFF_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';

export interface DeactivateTariffParams { id: string; }

@Injectable()
export class DeactivateTariffUseCase extends UseCase<DeactivateTariffParams, void> {
  constructor(@Inject(TARIFF_REPOSITORY_TOKEN) private readonly repo: TariffRepository) {
    super();
  }

  async execute(params: DeactivateTariffParams): Promise<Either<Failure, void>> {
    const existing = await this.repo.findById(params.id);
    if (existing.isLeft()) return existing as Either<Failure, never>;
    const tariff = existing.fold(() => null, t => t);
    if (!tariff) return left(new NotFoundFailure('Tarifa no encontrada'));
    if (!tariff.isActive) return left(new BusinessRuleFailure('La tarifa ya está desactivada'));

    return this.repo.deactivate(params.id);
  }
}
