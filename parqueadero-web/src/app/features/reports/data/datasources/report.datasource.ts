import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import {
  RevenueDailyRow,
  SessionsByTypeRow,
  OperatorPerformanceRow,
  ExportCsvParams,
  ExportCsvResult,
} from '../../domain/repositories/report.repository';

export abstract class ReportDataSource {
  abstract getRevenueDailyRows(
    dateFrom: Date,
    dateTo: Date,
    operatorId?: string | null,
    vehicleType?: string | null,
  ): Promise<Either<Failure, RevenueDailyRow[]>>;

  abstract getSessionsByTypeRows(
    dateFrom: Date,
    dateTo: Date,
  ): Promise<Either<Failure, SessionsByTypeRow[]>>;

  abstract getOperatorPerformanceRows(
    dateFrom: Date,
    dateTo: Date,
    operatorId?: string | null,
  ): Promise<Either<Failure, OperatorPerformanceRow[]>>;

  abstract requestCsvExport(params: ExportCsvParams): Promise<Either<Failure, ExportCsvResult>>;
}
