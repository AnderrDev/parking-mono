import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { PaginatedResult } from '../../../../shared/models/pagination.model';
import { TariffRepository, ListTariffsParams } from '../repositories/tariff.repository';
import { TARIFF_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';

export type ListTariffsResult = PaginatedResult<TariffEntity>;

@Injectable()
export class ListTariffsUseCase extends UseCase<ListTariffsParams, ListTariffsResult> {
  constructor(@Inject(TARIFF_REPOSITORY_TOKEN) private readonly repo: TariffRepository) {
    super();
  }

  async execute(params: ListTariffsParams): Promise<Either<Failure, ListTariffsResult>> {
    const page = params.pagination?.page ?? 1;
    const pageSize = params.pagination?.pageSize ?? 25;

    if (page < 1) return left(new ValidationFailure('Página debe ser ≥ 1', 'page'));
    if (pageSize < 10 || pageSize > 100) {
      return left(new ValidationFailure('pageSize debe estar entre 10 y 100', 'pageSize'));
    }

    return this.repo.list(params);
  }
}
