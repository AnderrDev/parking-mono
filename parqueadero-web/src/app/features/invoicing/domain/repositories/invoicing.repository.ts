import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceDetailEntity } from '../entities/invoice-detail.entity';

export interface RequestInvoiceParams {
  sessionId: string;
  customerId: string;
  notes?: string | null;
}

export interface ListInvoicesParams {
  dateFrom?: Date | null;
  dateTo?: Date | null;
  customerId?: string | null;
  internalNumber?: string | null;
  vehiclePlate?: string | null;
  paymentMethod?: string | null;
  page: number;
  pageSize: number;
}

export interface ListInvoicesRow {
  invoice: InvoiceEntity;
  vehiclePlate: string | null;
  customerName: string | null;
  paymentMethod: string | null;
}

export interface ListInvoicesResult {
  data: ListInvoicesRow[];
  pagination: PaginationMeta;
}

export abstract class InvoicingRepository {
  abstract requestInvoice(params: RequestInvoiceParams): Promise<Either<Failure, InvoiceEntity>>;
  abstract getById(invoiceId: string): Promise<Either<Failure, InvoiceEntity | null>>;
  abstract getDetailById(invoiceId: string): Promise<Either<Failure, InvoiceDetailEntity | null>>;
  abstract list(params: ListInvoicesParams): Promise<Either<Failure, ListInvoicesResult>>;
}
