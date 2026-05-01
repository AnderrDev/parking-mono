import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { AUDIT_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import {
  AuditRepository,
  ListAuditParams,
  ListAuditResult,
} from '../../domain/repositories/audit.repository';

@Injectable()
export class AuditRepositoryImpl extends AuditRepository {
  constructor(
    @Inject(AUDIT_DATASOURCE_TOKEN) private readonly ds: AuditRepository,
  ) {
    super();
  }

  async list(params: ListAuditParams): Promise<Either<Failure, ListAuditResult>> {
    return this.ds.list(params);
  }
}
