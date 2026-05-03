import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  GET_ACTIVE_SESSIONS_TOKEN,
  GET_REVENUE_BY_PERIOD_TOKEN,
  GET_SESSIONS_BY_TYPE_TOKEN,
  LIST_MONTHLY_PLANS_TOKEN,
  LIST_INVOICES_TOKEN,
} from '../../../../core/di/injection-tokens';
import { GetActiveSessionsUseCase } from '../../../parking/domain/usecases/get-active-sessions.usecase';
import { GetRevenueByPeriodUseCase } from '../../../reports/domain/usecases/get-revenue-by-period.usecase';
import { GetSessionsByTypeUseCase } from '../../../reports/domain/usecases/get-sessions-by-type.usecase';
import { ListMonthlyPlansUseCase } from '../../../monthly-plans/domain/usecases/list-monthly-plans.usecase';
import { ListInvoicesUseCase } from '../../../invoicing/domain/usecases/list-invoices.usecase';
import { NoParams } from '../../../../core/base/usecase';
import { ToastService } from '../../../../core/services/toast.service';
import { CurrencyCopPipe } from '../../../../shared/pipes/currency-cop.pipe';
import { RouterLink } from '@angular/router';
import { RevenueReportResult } from '../../../reports/domain/repositories/report.repository';
import { formatCOP } from '../../../../shared/utils/currency.utils';
import { barWidth as calcBarWidth } from '../../../../shared/utils/chart.utils';

interface Kpi {
  label: string;
  value: string;
  detail?: string | undefined;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | undefined;
}

interface BarPoint {
  label: string;
  value: number;
}

@Component({
  selector: 'app-executive-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CurrencyCopPipe, RouterLink],
  templateUrl: './executive-dashboard.page.html',
  styleUrl: './executive-dashboard.page.scss',
})
export class ExecutiveDashboardPageComponent implements OnInit {
  protected readonly loading = signal(true);

  protected readonly revenueToday = signal(0);
  protected readonly revenueMonth = signal(0);
  protected readonly activeSessionsCount = signal(0);
  protected readonly activeMonthliesCount = signal(0);
  protected readonly pendingInvoicesCount = signal(0);
  protected readonly expiringMonthliesCount = signal(0);

  protected readonly revenueByDay = signal<BarPoint[]>([]);
  protected readonly sessionsByType = signal<{ type: string; count: number }[]>([]);

  protected readonly kpis = computed<Kpi[]>(() => [
    {
      label: 'Ingresos hoy',
      value: this.formatCop(this.revenueToday()),
      variant: 'success',
    },
    {
      label: 'Ingresos del mes',
      value: this.formatCop(this.revenueMonth()),
      variant: 'primary',
    },
    {
      label: 'Vehículos en parqueadero',
      value: String(this.activeSessionsCount()),
      detail: 'Ahora',
    },
    {
      label: 'Mensualidades activas',
      value: String(this.activeMonthliesCount()),
      detail: this.expiringMonthliesCount() > 0
        ? `${this.expiringMonthliesCount()} por vencer`
        : 'Todas vigentes',
      variant: this.expiringMonthliesCount() > 0 ? 'warning' : undefined,
    },
    {
      label: 'Facturas pendientes',
      value: String(this.pendingInvoicesCount()),
      variant: this.pendingInvoicesCount() > 0 ? 'danger' : 'success',
    },
  ]);

  protected readonly maxRevenueBar = computed(() =>
    Math.max(1, ...this.revenueByDay().map((p) => p.value)),
  );

  private readonly toast = inject(ToastService);

  constructor(
    @Inject(GET_ACTIVE_SESSIONS_TOKEN)
    private readonly getActiveSessions: GetActiveSessionsUseCase,
    @Inject(GET_REVENUE_BY_PERIOD_TOKEN)
    private readonly revenueUC: GetRevenueByPeriodUseCase,
    @Inject(GET_SESSIONS_BY_TYPE_TOKEN)
    private readonly sessionsByTypeUC: GetSessionsByTypeUseCase,
    @Inject(LIST_MONTHLY_PLANS_TOKEN)
    private readonly listPlansUC: ListMonthlyPlansUseCase,
    @Inject(LIST_INVOICES_TOKEN)
    private readonly listInvoicesUC: ListInvoicesUseCase,
  ) {}

  ngOnInit(): void {
    void this.loadAll();
  }

  protected formatCop(cents: number): string {
    return formatCOP(cents);
  }

  protected barWidth(value: number): number {
    return calcBarWidth(value, this.maxRevenueBar());
  }

  protected formatBarValue(cents: number): string {
    return `$${Math.round(cents / 1000 / 100).toLocaleString('es-CO')}k`;
  }

  private async loadAll(): Promise<void> {
    this.loading.set(true);
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      activeRes,
      todayRes,
      monthRes,
      sevenDayRes,
      typesRes,
      plansRes,
      expiringRes,
      invoicesRes,
    ] = await Promise.all([
      this.getActiveSessions.execute(new NoParams()),
      this.revenueUC.execute({ dateFrom: startOfDay, dateTo: now, groupBy: 'day' }),
      this.revenueUC.execute({ dateFrom: startOfMonth, dateTo: now, groupBy: 'day' }),
      this.revenueUC.execute({ dateFrom: sevenDaysAgo, dateTo: now, groupBy: 'day' }),
      this.sessionsByTypeUC.execute({ dateFrom: sevenDaysAgo, dateTo: now }),
      this.listPlansUC.execute({
        status: 'active',
        pagination: { page: 1, pageSize: 1 },
      }),
      this.listPlansUC.execute({
        status: 'expiring',
        pagination: { page: 1, pageSize: 1 },
      }),
      this.listInvoicesUC.execute({ page: 1, pageSize: 100 }),
    ]);

    activeRes.fold(
      (f) => this.toast.error(`Error sesiones activas: ${f.message}`),
      ({ data }) => this.activeSessionsCount.set(data.length),
    );

    todayRes.fold(
      () => this.revenueToday.set(0),
      (r: RevenueReportResult) => this.revenueToday.set(r.totalRevenueCents),
    );
    monthRes.fold(
      () => this.revenueMonth.set(0),
      (r: RevenueReportResult) => this.revenueMonth.set(r.totalRevenueCents),
    );
    sevenDayRes.fold(
      () => this.revenueByDay.set([]),
      (r: RevenueReportResult) => {
        this.revenueByDay.set(
          r.byPeriod.map((p) => ({
            label: this.shortDayLabel(p.periodLabel, p.periodStart),
            value: p.revenueCents,
          })),
        );
      },
    );

    typesRes.fold(
      () => this.sessionsByType.set([]),
      (r) => {
        this.sessionsByType.set(
          r.byType.map((t) => ({ type: t.vehicleType, count: t.count })),
        );
      },
    );

    plansRes.fold(
      () => this.activeMonthliesCount.set(0),
      ({ pagination }) => this.activeMonthliesCount.set(pagination.total),
    );
    expiringRes.fold(
      () => this.expiringMonthliesCount.set(0),
      ({ pagination }) => this.expiringMonthliesCount.set(pagination.total),
    );

    invoicesRes.fold(
      () => this.pendingInvoicesCount.set(0),
      ({ data }) => {
        const pending = data.filter(
          (i) => i.dianStatus !== 'accepted' && i.dianStatus !== 'sent',
        ).length;
        this.pendingInvoicesCount.set(pending);
      },
    );

    this.loading.set(false);
  }

  private shortDayLabel(label: string, start: Date): string {
    if (start && !isNaN(start.getTime())) {
      return start.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit' });
    }
    return label;
  }
}
