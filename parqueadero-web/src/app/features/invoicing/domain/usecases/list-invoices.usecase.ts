import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { INVOICING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { InvoicingRepository, ListInvoicesParams, ListInvoicesResult } from '../repositories/invoicing.repository';
import { DianStatus } from '../entities/invoice.entity';

export interface ListInvoicesUseCaseParams {
  dateFrom?: Date | null;
  dateTo?: Date | null;
  dianStatus?: DianStatus | null;
  customerId?: string | null;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ListInvoicesUseCase extends UseCase<ListInvoicesUseCaseParams, ListInvoicesResult> {
  constructor(@Inject(INVOICING_REPOSITORY_TOKEN) private readonly repo: InvoicingRepository) {
    super();
  }

  async execute(params: ListInvoicesUseCaseParams): Promise<Either<Failure, ListInvoicesResult>> {
    if (params.dateFrom && params.dateTo && params.dateTo < params.dateFrom) {
      return left(new ValidationFailure('dateTo debe ser ≥ dateFrom'));
    }

    const repoParams: ListInvoicesParams = {
      ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
      ...(params.dateTo ? { dateTo: params.dateTo } : {}),
      ...(params.dianStatus ? { dianStatus: params.dianStatus } : {}),
      ...(params.customerId ? { customerId: params.customerId } : {}),
      page: Math.max(1, params.page ?? 1),
      pageSize: Math.min(100, Math.max(10, params.pageSize ?? 20)),
    };

    return this.repo.list(repoParams);
  }
}
