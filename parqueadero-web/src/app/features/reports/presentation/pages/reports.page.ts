import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { AuthStateService } from '../../../../core/services/auth-state.service';
import { ReportsForms } from '../forms/reports.forms';
import {
  GET_REVENUE_BY_PERIOD_TOKEN,
  GET_SESSIONS_BY_TYPE_TOKEN,
  GET_OPERATOR_PERFORMANCE_TOKEN,
  EXPORT_CSV_TOKEN,
} from '../../../../core/di/injection-tokens';
import { GetRevenueByPeriodUseCase } from '../../domain/usecases/get-revenue-by-period.usecase';
import { GetSessionsByTypeUseCase } from '../../domain/usecases/get-sessions-by-type.usecase';
import { GetOperatorPerformanceUseCase } from '../../domain/usecases/get-operator-performance.usecase';
import { ExportCsvUseCase } from '../../domain/usecases/export-csv.usecase';
import {
  RevenueReportResult,
  SessionsByTypeResult,
  OperatorPerformanceResult,
  GroupBy,
} from '../../domain/repositories/report.repository';
import { ToastService } from '../../../../core/services/toast.service';

type Tab = 'revenue' | 'vehicles' | 'operators';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './reports.page.html',
  styleUrl: './reports.page.scss',
})
export class ReportsPageComponent implements OnInit {
  tab = signal<Tab>('revenue');
  loading = signal(false);
  errorMsg = signal<string | null>(null);

  revenue = signal<RevenueReportResult | null>(null);
  sessionsByType = signal<SessionsByTypeResult | null>(null);
  operatorPerf = signal<OperatorPerformanceResult | null>(null);

  filterForm!: FormGroup;

  get isAdmin(): () => boolean {
    return () => this.auth.role() === 'admin';
  }

  constructor(
    private readonly reportsForms: ReportsForms,
    private readonly auth: AuthStateService,
    @Inject(GET_REVENUE_BY_PERIOD_TOKEN) private readonly revenueUC: GetRevenueByPeriodUseCase,
    @Inject(GET_SESSIONS_BY_TYPE_TOKEN) private readonly sessionTypesUC: GetSessionsByTypeUseCase,
    @Inject(GET_OPERATOR_PERFORMANCE_TOKEN) private readonly operatorUC: GetOperatorPerformanceUseCase,
    @Inject(EXPORT_CSV_TOKEN) private readonly exportUC: ExportCsvUseCase,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    this.filterForm = this.reportsForms.createReportFilterForm({
      dateFrom: monthAgo,
      dateTo: today,
    });
    this.loadReport();
  }

  async loadReport(): Promise<void> {
    if (this.filterForm.invalid) return;
    this.loading.set(true);
    this.errorMsg.set(null);

    const { dateFrom, dateTo, groupBy } = this.filterForm.value as {
      dateFrom: string; dateTo: string; groupBy: GroupBy;
    };
    const from = new Date(dateFrom + 'T00:00:00-05:00');
    const to = new Date(dateTo + 'T23:59:59-05:00');
    const role = this.auth.role() ?? 'operador';

    const [revenueRes, sessionsRes] = await Promise.all([
      this.revenueUC.execute({ dateFrom: from, dateTo: to, groupBy }),
      this.sessionTypesUC.execute({ dateFrom: from, dateTo: to }),
    ]);

    revenueRes.fold(
      (f) => {
        this.errorMsg.set(f.message);
        this.toast.error(`Error al cargar ingresos: ${f.message}`);
      },
      (r) => this.revenue.set(r),
    );
    sessionsRes.fold(
      (f) => this.toast.error(`Error al cargar vehículos: ${f.message}`),
      (r) => this.sessionsByType.set(r),
    );

    if (role === 'admin') {
      const opRes = await this.operatorUC.execute({
        dateFrom: from, dateTo: to, userRole: role,
      });
      opRes.fold(
        (f) => this.toast.error(`Error al cargar operadores: ${f.message}`),
        (r) => this.operatorPerf.set(r),
      );
    }

    this.loading.set(false);
  }

  async exportCsv(): Promise<void> {
    if (this.filterForm.invalid) return;
    this.loading.set(true);
    this.errorMsg.set(null);

    const { dateFrom, dateTo } = this.filterForm.value as { dateFrom: string; dateTo: string };
    const from = new Date(dateFrom + 'T00:00:00-05:00');
    const to = new Date(dateTo + 'T23:59:59-05:00');
    const role = this.auth.role() ?? 'operador';
    const entity = this.tab() === 'vehicles' ? 'sessions' : 'payments';

    const result = await this.exportUC.execute({
      entity,
      dateFrom: from,
      dateTo: to,
      userRole: role,
    });

    result.fold(
      (f) => {
        this.errorMsg.set(f.message);
        this.toast.error(`Exportación falló: ${f.message}`);
      },
      ({ downloadUrl }) => {
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = '';
        a.click();
        this.toast.success('CSV descargándose');
      },
    );

    this.loading.set(false);
  }
}
