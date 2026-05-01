import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { INVOICING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoicingRepository, RequestInvoiceParams } from '../repositories/invoicing.repository';

@Injectable()
export class RequestInvoiceUseCase extends UseCase<RequestInvoiceParams, InvoiceEntity> {
  constructor(@Inject(INVOICING_REPOSITORY_TOKEN) private readonly repo: InvoicingRepository) {
    super();
  }

  async execute(params: RequestInvoiceParams): Promise<Either<Failure, InvoiceEntity>> {
    if (!params.sessionId?.trim()) {
      return left(new ValidationFailure('sessionId es requerido'));
    }
    if (!params.customerId?.trim()) {
      return left(new ValidationFailure('customerId es requerido'));
    }
    if (params.notes && params.notes.length > 500) {
      return left(new ValidationFailure('Las notas no pueden superar 500 caracteres'));
    }
    return this.repo.requestInvoice(params);
  }
}
