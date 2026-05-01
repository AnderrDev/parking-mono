import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { INVOICING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoicingRepository } from '../repositories/invoicing.repository';

export interface ReissueInvoiceParams {
  invoiceId: string;
}

@Injectable()
export class ReissueInvoiceUseCase extends UseCase<ReissueInvoiceParams, InvoiceEntity> {
  constructor(@Inject(INVOICING_REPOSITORY_TOKEN) private readonly repo: InvoicingRepository) {
    super();
  }

  async execute(params: ReissueInvoiceParams): Promise<Either<Failure, InvoiceEntity>> {
    if (!params.invoiceId?.trim()) {
      return left(new ValidationFailure('invoiceId es requerido'));
    }
    return this.repo.reissueInvoice(params.invoiceId);
  }
}
