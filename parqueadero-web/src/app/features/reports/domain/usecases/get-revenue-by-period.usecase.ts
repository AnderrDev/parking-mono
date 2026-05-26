import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { REPORT_REPOSITORY_TOKEN, GET_SETTING_TOKEN } from '../../../../core/di/injection-tokens';
import {
  ReportRepository,
  RevenueByPeriodParams,
  RevenueReportResult,
  RevenuePeriod,
  GroupBy,
  RevenueDailyRow,
} from '../repositories/report.repository';
import { GetSettingUseCase } from '../../../settings/domain/usecases/get-setting.usecase';
import { OperationalConfigValue } from '../../../settings/domain/entities/app-setting.entity';

const DEFAULT_MAX_RANGE_DAYS = 365;

function isoWeek(d: Date): string {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function periodLabel(day: string, groupBy: GroupBy): string {
  if (groupBy === 'day') return day;
  const d = new Date(day + 'T12:00:00Z');
  if (groupBy === 'week') return isoWeek(d);
  return day.slice(0, 7);
}

@Injectable()
export class GetRevenueByPeriodUseCase extends UseCase<RevenueByPeriodParams, RevenueReportResult> {
  constructor(
    @Inject(REPORT_REPOSITORY_TOKEN) private readonly repo: ReportRepository,
    @Inject(GET_SETTING_TOKEN) private readonly getSetting: GetSettingUseCase,
  ) {
    super();
  }

  async execute(params: RevenueByPeriodParams): Promise<Either<Failure, RevenueReportResult>> {
    if (params.dateTo < params.dateFrom) {
      return left(new ValidationFailure('dateTo debe ser ≥ dateFrom'));
    }
    const maxRangeDays = await this.loadMaxRangeDays();
    const maxRangeMs = maxRangeDays * 24 * 60 * 60 * 1000;
    if (params.dateTo.getTime() - params.dateFrom.getTime() > maxRangeMs) {
      return left(new ValidationFailure(`El rango máximo es ${maxRangeDays} días`));
    }

    const rowsResult = await this.repo.getRevenueDailyRows(
      params.dateFrom,
      params.dateTo,
      params.operatorId,
      params.vehicleType ?? null,
    );
    if (rowsResult.isLeft()) return left(rowsResult.value);
    const rows = rowsResult.value as RevenueDailyRow[];

    // Aggregate by period
    const periodMap = new Map<string, { revenueCents: number; sessions: number; periodStart: Date }>();
    const methodMap = new Map<string, { amountCents: number; count: number }>();
    let totalRevenue = 0;
    let totalSessions = 0;

    for (const row of rows) {
      const label = periodLabel(row.day, params.groupBy);
      const existing = periodMap.get(label) ?? { revenueCents: 0, sessions: 0, periodStart: new Date(row.day + 'T00:00:00-05:00') };
      periodMap.set(label, {
        revenueCents: existing.revenueCents + row.revenue_cents,
        sessions: existing.sessions + 1,
        periodStart: existing.periodStart,
      });

      const mEntry = methodMap.get(row.method) ?? { amountCents: 0, count: 0 };
      methodMap.set(row.method, { amountCents: mEntry.amountCents + row.amount_cents, count: mEntry.count + 1 });

      totalRevenue += row.revenue_cents;
      totalSessions++;
    }

    const byPeriod: RevenuePeriod[] = Array.from(periodMap.entries())
      .map(([label, v]) => ({ periodLabel: label, periodStart: v.periodStart, revenueCents: v.revenueCents, sessions: v.sessions }))
      .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());

    const byMethod = Array.from(methodMap.entries()).map(([method, v]) => ({
      method,
      amountCents: v.amountCents,
      count: v.count,
    }));

    return right({
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      groupBy: params.groupBy,
      totalRevenueCents: totalRevenue,
      totalSessions,
      byPeriod,
      byMethod,
    });
  }

  private async loadMaxRangeDays(): Promise<number> {
    const r = await this.getSetting.execute({ key: 'operational_config' });
    if (r.isLeft() || !r.value) return DEFAULT_MAX_RANGE_DAYS;
    const v = (r.value.value as OperationalConfigValue).max_report_range_days;
    return typeof v === 'number' && v > 0 ? v : DEFAULT_MAX_RANGE_DAYS;
  }
}
