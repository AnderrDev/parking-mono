import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { InvoiceEntity, DianStatus } from '../entities/invoice.entity';

export interface RequestInvoiceParams {
  sessionId: string;
  customerId: string;
  notes?: string | null;
}

export interface ListInvoicesParams {
  dateFrom?: Date | null;
  dateTo?: Date | null;
  dianStatus?: DianStatus | null;
  customerId?: string | null;
  page: number;
  pageSize: number;
}

export interface ListInvoicesResult {
  data: InvoiceEntity[];
  pagination: PaginationMeta;
}

export abstract class InvoicingRepository {
  abstract requestInvoice(params: RequestInvoiceParams): Promise<Either<Failure, InvoiceEntity>>;
  abstract reissueInvoice(invoiceId: string): Promise<Either<Failure, InvoiceEntity>>;
  abstract getById(invoiceId: string): Promise<Either<Failure, InvoiceEntity | null>>;
  abstract list(params: ListInvoicesParams): Promise<Either<Failure, ListInvoicesResult>>;
}
