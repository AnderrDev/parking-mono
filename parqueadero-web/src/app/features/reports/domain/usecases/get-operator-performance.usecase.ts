import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, UnauthorizedFailure, ValidationFailure } from '../../../../core/either/failures';
import { REPORT_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import {
  ReportRepository,
  OperatorPerformanceParams,
  OperatorPerformanceResult,
  OperatorRow,
  OperatorPerformanceRow,
} from '../repositories/report.repository';

const MAX_RANGE_MS = 365 * 24 * 60 * 60 * 1000;

export interface OperatorPerformanceUseCaseParams extends OperatorPerformanceParams {
  userRole: string;
}

@Injectable()
export class GetOperatorPerformanceUseCase extends UseCase<OperatorPerformanceUseCaseParams, OperatorPerformanceResult> {
  constructor(@Inject(REPORT_REPOSITORY_TOKEN) private readonly repo: ReportRepository) {
    super();
  }

  async execute(params: OperatorPerformanceUseCaseParams): Promise<Either<Failure, OperatorPerformanceResult>> {
    if (params.userRole !== 'admin') {
      return left(new UnauthorizedFailure('Solo administradores pueden ver el rendimiento de operadores'));
    }
    if (params.dateTo < params.dateFrom) {
      return left(new ValidationFailure('dateTo debe ser ≥ dateFrom'));
    }
    if (params.dateTo.getTime() - params.dateFrom.getTime() > MAX_RANGE_MS) {
      return left(new ValidationFailure('El rango máximo es 12 meses'));
    }

    const rowsResult = await this.repo.getOperatorPerformanceRows(
      params.dateFrom,
      params.dateTo,
      params.operatorId,
    );
    if (rowsResult.isLeft()) return left(rowsResult.value);
    const rows = rowsResult.value as OperatorPerformanceRow[];

    // Aggregate by operator
    const opMap = new Map<string, {
      name: string; shifts: number; hours: number;
      sessions: number; revenue: number; cashDiff: number;
    }>();

    for (const row of rows) {
      const entry = opMap.get(row.operator_id) ?? {
        name: row.operator_name, shifts: 0, hours: 0, sessions: 0, revenue: 0, cashDiff: 0,
      };
      opMap.set(row.operator_id, {
        name: row.operator_name,
        shifts: entry.shifts + 1,
        hours: entry.hours + (row.hours_worked ?? 0),
        sessions: entry.sessions + Number(row.sessions_attended ?? 0),
        revenue: entry.revenue + Number(row.revenue_cents ?? 0),
        cashDiff: entry.cashDiff + Math.abs(row.difference_cents ?? 0),
      });
    }

    const operators: OperatorRow[] = Array.from(opMap.entries()).map(([operatorId, v]) => ({
      operatorId,
      operatorName: v.name,
      shiftsWorked: v.shifts,
      totalHoursWorked: Math.round(v.hours * 10) / 10,
      sessionsAttended: v.sessions,
      revenueCents: v.revenue,
      avgSessionsPerShift: v.shifts > 0 ? Math.round(v.sessions / v.shifts) : 0,
      cashDifferenceCents: v.cashDiff,
    }));

    return right({ dateFrom: params.dateFrom, dateTo: params.dateTo, operators });
  }
}
