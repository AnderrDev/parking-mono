import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { AuditAction, AuditEntryEntity } from '../entities/audit-entry.entity';

export interface ListAuditParams {
  dateFrom?: Date | null;
  dateTo?: Date | null;
  userId?: string | null;
  action?: AuditAction | null;
  entityType?: string | null;
  page: number;
  pageSize: number;
}

export interface ListAuditResult {
  data: AuditEntryEntity[];
  pagination: PaginationMeta;
}

export abstract class AuditRepository {
  abstract list(params: ListAuditParams): Promise<Either<Failure, ListAuditResult>>;
}
