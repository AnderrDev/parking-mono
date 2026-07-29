import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { REPORT_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import {
  ReportRepository,
  SessionsByTypeParams,
  SessionsByTypeResult,
  VehicleTypeRow,
  SessionsByTypeRow,
  HourBucket,
} from '../repositories/report.repository';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';
import { formatTimeBogota } from '../../../../shared/utils/date.utils';

const MAX_RANGE_MS = 365 * 24 * 60 * 60 * 1000;

@Injectable()
export class GetSessionsByTypeUseCase extends UseCase<SessionsByTypeParams, SessionsByTypeResult> {
  constructor(@Inject(REPORT_REPOSITORY_TOKEN) private readonly repo: ReportRepository) {
    super();
  }

  async execute(params: SessionsByTypeParams): Promise<Either<Failure, SessionsByTypeResult>> {
    if (params.dateTo < params.dateFrom) {
      return left(new ValidationFailure('dateTo debe ser ≥ dateFrom'));
    }
    if (params.dateTo.getTime() - params.dateFrom.getTime() > MAX_RANGE_MS) {
      return left(new ValidationFailure('El rango máximo es 12 meses'));
    }

    const rowsResult = await this.repo.getSessionsByTypeRows(params.dateFrom, params.dateTo);
    if (rowsResult.isLeft()) return left(rowsResult.value);
    const rows = rowsResult.value as SessionsByTypeRow[];

    const typeMap = new Map<string, { count: number; totalDuration: number; revenueCents: number }>();
    for (const row of rows) {
      const entry = typeMap.get(row.vehicle_type) ?? { count: 0, totalDuration: 0, revenueCents: 0 };
      typeMap.set(row.vehicle_type, {
        count: entry.count + 1,
        totalDuration: entry.totalDuration + (row.duration_minutes ?? 0),
        revenueCents: entry.revenueCents + (row.revenue_cents ?? 0),
      });
    }

    const total = rows.length;
    const byType: VehicleTypeRow[] = Array.from(typeMap.entries()).map(([vehicleType, v]) => ({
      vehicleType: vehicleType as VehicleType,
      count: v.count,
      avgDurationMinutes: v.count > 0 ? Math.round(v.totalDuration / v.count) : 0,
      revenueCents: v.revenueCents,
      percentOfTotal: total > 0 ? Math.round((v.count / total) * 100) : 0,
    }));

    const byHour: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    for (const row of rows) {
      const hour = Number(formatTimeBogota(new Date(row.entry_at), 'H'));
      byHour[hour]!.count++;
    }

    return right({ dateFrom: params.dateFrom, dateTo: params.dateTo, totalSessions: total, byType, byHour });
  }
}
