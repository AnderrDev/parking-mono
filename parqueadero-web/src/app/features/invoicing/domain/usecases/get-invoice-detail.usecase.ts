import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { INVOICING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { InvoiceDetailEntity } from '../entities/invoice-detail.entity';
import { InvoicingRepository } from '../repositories/invoicing.repository';

export interface GetInvoiceDetailParams {
  invoiceId: string;
}

@Injectable()
export class GetInvoiceDetailUseCase extends UseCase<GetInvoiceDetailParams, InvoiceDetailEntity | null> {
  constructor(@Inject(INVOICING_REPOSITORY_TOKEN) private readonly repo: InvoicingRepository) {
    super();
  }

  async execute(params: GetInvoiceDetailParams): Promise<Either<Failure, InvoiceDetailEntity | null>> {
    if (!params.invoiceId?.trim()) {
      return left(new ValidationFailure('invoiceId es requerido'));
    }
    return this.repo.getDetailById(params.invoiceId);
  }
}
