import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left } from '../../../../core/either/either';
import { Failure, UnauthorizedFailure, ValidationFailure } from '../../../../core/either/failures';
import { REPORT_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import {
  ReportRepository,
  ExportCsvParams,
  ExportCsvResult,
} from '../repositories/report.repository';

const MAX_CSV_RANGE_MS = 90 * 24 * 60 * 60 * 1000; // 3 meses

export interface ExportCsvUseCaseParams extends ExportCsvParams {
  userRole: string;
}

@Injectable()
export class ExportCsvUseCase extends UseCase<ExportCsvUseCaseParams, ExportCsvResult> {
  constructor(@Inject(REPORT_REPOSITORY_TOKEN) private readonly repo: ReportRepository) {
    super();
  }

  async execute(params: ExportCsvUseCaseParams): Promise<Either<Failure, ExportCsvResult>> {
    if (!['admin', 'contador', 'operador'].includes(params.userRole)) {
      return left(new UnauthorizedFailure('No tienes permiso para exportar reportes'));
    }
    if (params.dateTo < params.dateFrom) {
      return left(new ValidationFailure('dateTo debe ser ≥ dateFrom'));
    }
    if (params.dateTo.getTime() - params.dateFrom.getTime() > MAX_CSV_RANGE_MS) {
      return left(new ValidationFailure('El rango máximo para CSV es 3 meses'));
    }

    return this.repo.requestCsvExport(params);
  }
}
