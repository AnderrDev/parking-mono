import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { CUSTOMER_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { CustomerEntity } from '../entities/customer.entity';
import { CustomerRepository, ListCustomersParams } from '../repositories/customer.repository';

export interface ListCustomersResult { data: CustomerEntity[]; pagination: PaginationMeta }

@Injectable()
export class ListCustomersUseCase extends UseCase<ListCustomersParams, ListCustomersResult> {
  constructor(@Inject(CUSTOMER_REPOSITORY_TOKEN) private readonly repo: CustomerRepository) {
    super();
  }

  async execute(params: ListCustomersParams): Promise<Either<Failure, ListCustomersResult>> {
    const page = params.pagination?.page ?? 1;
    const pageSize = params.pagination?.pageSize ?? 25;

    if (page < 1) return left(new ValidationFailure('La página debe ser ≥ 1'));
    if (pageSize < 10 || pageSize > 100) return left(new ValidationFailure('El tamaño de página debe estar entre 10 y 100'));

    return this.repo.list(params);
  }
}
