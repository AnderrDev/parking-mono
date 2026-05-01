import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { AUDIT_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import {
  AuditRepository,
  ListAuditParams,
  ListAuditResult,
} from '../repositories/audit.repository';

@Injectable()
export class ListAuditUseCase extends UseCase<ListAuditParams, ListAuditResult> {
  constructor(
    @Inject(AUDIT_REPOSITORY_TOKEN) private readonly repo: AuditRepository,
  ) {
    super();
  }

  async execute(params: ListAuditParams): Promise<Either<Failure, ListAuditResult>> {
    return this.repo.list(params);
  }
}
