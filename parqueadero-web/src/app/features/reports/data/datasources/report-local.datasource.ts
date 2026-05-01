import { Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, NetworkFailure } from '../../../../core/either/failures';
import {
  RevenueDailyRow,
  SessionsByTypeRow,
  OperatorPerformanceRow,
  ExportCsvParams,
  ExportCsvResult,
} from '../../domain/repositories/report.repository';
import { ReportDataSource } from './report.datasource';

// Reports rely on Supabase DB views not available in local SQLite.
@Injectable()
export class ReportLocalDataSource extends ReportDataSource {
  async getRevenueDailyRows(
    _dateFrom: Date,
    _dateTo: Date,
    _operatorId?: string | null,
    _vehicleType?: string | null,
  ): Promise<Either<Failure, RevenueDailyRow[]>> {
    return left(new NetworkFailure('Los reportes requieren conexión a internet'));
  }

  async getSessionsByTypeRows(
    _dateFrom: Date,
    _dateTo: Date,
  ): Promise<Either<Failure, SessionsByTypeRow[]>> {
    return left(new NetworkFailure('Los reportes requieren conexión a internet'));
  }

  async getOperatorPerformanceRows(
    _dateFrom: Date,
    _dateTo: Date,
    _operatorId?: string | null,
  ): Promise<Either<Failure, OperatorPerformanceRow[]>> {
    return left(new NetworkFailure('Los reportes requieren conexión a internet'));
  }

  async requestCsvExport(_params: ExportCsvParams): Promise<Either<Failure, ExportCsvResult>> {
    return left(new NetworkFailure('La exportación CSV requiere conexión a internet'));
  }
}
