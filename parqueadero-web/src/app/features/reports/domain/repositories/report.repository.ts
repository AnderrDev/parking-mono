import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';

// ── Revenue by period ─────────────────────────────────────────────────────────

export type GroupBy = 'day' | 'week' | 'month';

export interface RevenueByPeriodParams {
  dateFrom: Date;
  dateTo: Date;
  groupBy: GroupBy;
  operatorId?: string | null;
  vehicleType?: VehicleType | null;
}

export interface RevenuePeriod {
  periodLabel: string;
  periodStart: Date;
  revenueCents: number;
  sessions: number;
}

export interface RevenueReportResult {
  dateFrom: Date;
  dateTo: Date;
  groupBy: GroupBy;
  totalRevenueCents: number;
  /**
   * Parte del total que viene de venta de planes (mensualidad o quincena),
   * es decir pagos sin sesión asociada. Se expone aparte porque esos
   * ingresos NO aparecen en el reporte por tipo de vehículo: un plan no
   * tiene tipo, así que sumar esa tabla nunca da el total.
   */
  planRevenueCents: number;
  /** Cobros de parqueo por tiempo. Es `totalSessions` sin las ventas de plan. */
  totalSessions: number;
  planSalesCount: number;
  byPeriod: RevenuePeriod[];
  byMethod: { method: string; amountCents: number; count: number }[];
}

// ── Sessions by type ──────────────────────────────────────────────────────────

export interface SessionsByTypeParams {
  dateFrom: Date;
  dateTo: Date;
}

export interface VehicleTypeRow {
  vehicleType: VehicleType;
  count: number;
  avgDurationMinutes: number;
  revenueCents: number;
  percentOfTotal: number;
}

/** Conteo de entradas para una hora del día (0-23), zona Bogotá. */
export interface HourBucket {
  hour: number;
  count: number;
}

export interface SessionsByTypeResult {
  dateFrom: Date;
  dateTo: Date;
  totalSessions: number;
  byType: VehicleTypeRow[];
  byHour: HourBucket[];
}

// ── Operator performance ───────────────────────────────────────────────────────

export interface OperatorPerformanceParams {
  dateFrom: Date;
  dateTo: Date;
  operatorId?: string | null;
}

export interface OperatorRow {
  operatorId: string;
  operatorName: string;
  shiftsWorked: number;
  totalHoursWorked: number;
  sessionsAttended: number;
  revenueCents: number;
  avgSessionsPerShift: number;
  cashDifferenceCents: number;
}

export interface OperatorPerformanceResult {
  dateFrom: Date;
  dateTo: Date;
  operators: OperatorRow[];
}

// ── CSV Export ────────────────────────────────────────────────────────────────

export type CsvEntity = 'payments' | 'sessions';

export interface ExportCsvParams {
  entity: CsvEntity;
  dateFrom: Date;
  dateTo: Date;
  operatorId?: string | null;
}

export interface ExportCsvResult {
  downloadUrl: string;
  expiresAt: Date;
}

// ── Raw view rows ─────────────────────────────────────────────────────────────

export interface RevenueDailyRow {
  payment_id: string;
  paid_at: string;
  day: string;
  method: string;
  amount_cents: number;
  revenue_cents: number;
  operator_id: string;
  operator_name: string;
  session_id: string | null;
  vehicle_type: string | null;
}

export interface SessionsByTypeRow {
  session_id: string;
  vehicle_type: string;
  entry_at: string;
  exit_at: string;
  duration_minutes: number;
  day: string;
  operator_id: string;
  operator_name: string;
  amount_cents: number;
  revenue_cents: number;
  payment_method: string | null;
}

export interface OperatorPerformanceRow {
  shift_id: string;
  operator_id: string;
  operator_name: string;
  opened_at: string;
  closed_at: string | null;
  shift_status: string;
  hours_worked: number;
  sessions_attended: number;
  revenue_cents: number;
  difference_cents: number;
}

// ── Repository abstract ───────────────────────────────────────────────────────

export abstract class ReportRepository {
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
