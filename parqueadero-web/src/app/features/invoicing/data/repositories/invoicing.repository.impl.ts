import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { INVOICING_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { InvoiceEntity } from '../../domain/entities/invoice.entity';
import { InvoiceDetailEntity } from '../../domain/entities/invoice-detail.entity';
import {
  InvoicingRepository,
  RequestInvoiceParams,
  ListInvoicesParams,
  ListInvoicesResult,
} from '../../domain/repositories/invoicing.repository';

@Injectable()
export class InvoicingRepositoryImpl extends InvoicingRepository {
  constructor(
    @Inject(INVOICING_REMOTE_DATASOURCE_TOKEN) private readonly remote: InvoicingRepository,
  ) {
    super();
  }

  requestInvoice(params: RequestInvoiceParams): Promise<Either<Failure, InvoiceEntity>> {
    return this.remote.requestInvoice(params);
  }

  getById(invoiceId: string): Promise<Either<Failure, InvoiceEntity | null>> {
    return this.remote.getById(invoiceId);
  }

  getDetailById(invoiceId: string): Promise<Either<Failure, InvoiceDetailEntity | null>> {
    return this.remote.getDetailById(invoiceId);
  }

  list(params: ListInvoicesParams): Promise<Either<Failure, ListInvoicesResult>> {
    return this.remote.list(params);
  }
}
