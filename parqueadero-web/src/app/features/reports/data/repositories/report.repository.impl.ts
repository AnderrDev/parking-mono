import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { REPORT_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import {
  ReportRepository,
  RevenueDailyRow,
  SessionsByTypeRow,
  OperatorPerformanceRow,
  ExportCsvParams,
  ExportCsvResult,
} from '../../domain/repositories/report.repository';
import { ReportDataSource } from '../datasources/report.datasource';

@Injectable()
export class ReportRepositoryImpl extends ReportRepository {
  constructor(
    @Inject(REPORT_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: ReportDataSource,
  ) {
    super();
  }

  async getRevenueDailyRows(
    dateFrom: Date,
    dateTo: Date,
    operatorId?: string | null,
    vehicleType?: string | null,
  ): Promise<Either<Failure, RevenueDailyRow[]>> {
    return this.remoteDs.getRevenueDailyRows(dateFrom, dateTo, operatorId, vehicleType);
  }

  async getSessionsByTypeRows(
    dateFrom: Date,
    dateTo: Date,
  ): Promise<Either<Failure, SessionsByTypeRow[]>> {
    return this.remoteDs.getSessionsByTypeRows(dateFrom, dateTo);
  }

  async getOperatorPerformanceRows(
    dateFrom: Date,
    dateTo: Date,
    operatorId?: string | null,
  ): Promise<Either<Failure, OperatorPerformanceRow[]>> {
    return this.remoteDs.getOperatorPerformanceRows(dateFrom, dateTo, operatorId);
  }

  async requestCsvExport(params: ExportCsvParams): Promise<Either<Failure, ExportCsvResult>> {
    return this.remoteDs.requestCsvExport(params);
  }
}
