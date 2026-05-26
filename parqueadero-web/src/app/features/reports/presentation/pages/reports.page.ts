import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { AuthStateService } from '../../../../core/services/auth-state.service';
import { ReportsForms, DateRangePreset, DateRange } from '../forms/reports.forms';
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
import { CurrencyCopPipe } from '../../../../shared/pipes/currency-cop.pipe';
import { barWidth as calcBarWidth, pctOf } from '../../../../shared/utils/chart.utils';
import { formatBogotaDay } from '../../../../shared/utils/date.utils';
import { PaymentMethodStackComponent } from '../components/payment-method-stack.component';

type Tab = 'accounting' | 'revenue' | 'vehicles' | 'operators';

interface Delta {
  /** Cambio porcentual (+12 = subió 12%, −5 = bajó 5%, null = sin previo). */
  pct: number | null;
  /** Cambio absoluto (en la unidad nativa: cents para plata, # para conteos). */
  abs: number;
  /** El previo era 0 → mostramos "Nuevo" en lugar de % infinito. */
  isNew: boolean;
}

@Component({
  selector: 'app-reports-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CurrencyCopPipe,
    PaymentMethodStackComponent,
  ],
  templateUrl: './reports.page.html',
  styleUrl: './reports.page.scss',
})
export class ReportsPageComponent implements OnInit {
  // ── State ───────────────────────────────────────────────────────────────────
  protected readonly tab = signal<Tab>('accounting');
  protected readonly loading = signal(false);
  protected readonly errorMsg = signal<string | null>(null);

  // Datos del rango actual
  protected readonly revenue = signal<RevenueReportResult | null>(null);
  protected readonly sessionsByType = signal<SessionsByTypeResult | null>(null);
  protected readonly operatorPerf = signal<OperatorPerformanceResult | null>(null);
  // Datos del rango previo (cuando "Comparar" está activo)
  protected readonly revenuePrev = signal<RevenueReportResult | null>(null);
  protected readonly sessionsPrev = signal<SessionsByTypeResult | null>(null);

  protected filterForm!: FormGroup;

  // ── Diccionarios humanos ────────────────────────────────────────────────────
  protected readonly methodLabels: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    free: 'Gratis (cortesía/mensualidad)',
  };

  protected readonly vehicleLabels: Record<string, string> = {
    carro: 'Carro',
    moto: 'Moto',
    bicicleta: 'Bicicleta',
    otro: 'Otro',
  };

  protected readonly presetLabels: Record<DateRangePreset, string> = {
    today: 'Hoy',
    week: 'Esta semana',
    month: 'Este mes',
    lastMonth: 'Mes pasado',
    last30: 'Últimos 30 días',
    custom: 'Personalizado',
  };

  protected readonly presetOptions: DateRangePreset[] = [
    'today', 'week', 'month', 'lastMonth', 'last30', 'custom',
  ];

  // ── Computed: KPIs ──────────────────────────────────────────────────────────
  protected readonly compareEnabled = computed(() => !!this.filterForm?.value?.compare);

  protected readonly totalRevenueCents = computed(() => this.revenue()?.totalRevenueCents ?? 0);
  protected readonly totalSessions = computed(() => this.revenue()?.totalSessions ?? 0);
  protected readonly avgTicketCents = computed(() => {
    const sessions = this.totalSessions();
    return sessions > 0 ? Math.round(this.totalRevenueCents() / sessions) : 0;
  });

  protected readonly revenueDelta = computed<Delta>(() =>
    this.deltaFor(this.revenue()?.totalRevenueCents, this.revenuePrev()?.totalRevenueCents),
  );
  protected readonly sessionsDelta = computed<Delta>(() =>
    this.deltaFor(this.revenue()?.totalSessions, this.revenuePrev()?.totalSessions),
  );
  protected readonly avgTicketDelta = computed<Delta>(() => {
    const cur = this.avgTicketCents();
    const prevRev = this.revenuePrev()?.totalRevenueCents ?? 0;
    const prevSessions = this.revenuePrev()?.totalSessions ?? 0;
    const prev = prevSessions > 0 ? Math.round(prevRev / prevSessions) : 0;
    return this.deltaFor(cur, prev);
  });

  protected readonly bestDay = computed<{ label: string; revenueCents: number } | null>(() => {
    const periods = this.revenue()?.byPeriod ?? [];
    if (periods.length === 0) return null;
    const best = periods.reduce((acc, p) => (p.revenueCents > acc.revenueCents ? p : acc));
    return { label: best.periodLabel, revenueCents: best.revenueCents };
  });

  protected readonly dominantMethod = computed<{ label: string; pct: number } | null>(() => {
    const methods = this.revenue()?.byMethod ?? [];
    if (methods.length === 0) return null;
    const total = methods.reduce((s, m) => s + m.amountCents, 0);
    if (total === 0) return null;
    const top = methods.reduce((acc, m) => (m.amountCents > acc.amountCents ? m : acc));
    return {
      label: this.methodLabels[top.method] ?? top.method,
      pct: Math.round((top.amountCents / total) * 100),
    };
  });

  protected readonly dominantVehicle = computed<{ label: string; pct: number } | null>(() => {
    const types = this.sessionsByType()?.byType ?? [];
    if (types.length === 0) return null;
    const top = types.reduce((acc, t) => (t.count > acc.count ? t : acc));
    return { label: this.vehicleLabels[top.vehicleType] ?? top.vehicleType, pct: top.percentOfTotal };
  });

  protected readonly avgDurationGlobal = computed(() => {
    const types = this.sessionsByType()?.byType ?? [];
    if (types.length === 0) return 0;
    const totalMin = types.reduce((s, t) => s + t.avgDurationMinutes * t.count, 0);
    const totalCount = types.reduce((s, t) => s + t.count, 0);
    return totalCount > 0 ? Math.round(totalMin / totalCount) : 0;
  });

  // Para gráficos
  protected readonly maxRevenueByPeriod = computed(() =>
    Math.max(1, ...(this.revenue()?.byPeriod ?? []).map((p) => p.revenueCents)),
  );
  protected readonly methodTotalCents = computed(() =>
    (this.revenue()?.byMethod ?? []).reduce((s, m) => s + m.amountCents, 0),
  );
  protected readonly maxVehicleCount = computed(() =>
    Math.max(1, ...(this.sessionsByType()?.byType ?? []).map((t) => t.count)),
  );

  // Operadores: extras
  protected readonly topOperatorByShifts = computed(() => {
    const ops = this.operatorPerf()?.operators ?? [];
    if (ops.length === 0) return null;
    return ops.reduce((acc, o) => (o.shiftsWorked > acc.shiftsWorked ? o : acc));
  });
  protected readonly topOperatorByRevenue = computed(() => {
    const ops = this.operatorPerf()?.operators ?? [];
    if (ops.length === 0) return null;
    return ops.reduce((acc, o) => (o.revenueCents > acc.revenueCents ? o : acc));
  });
  protected readonly totalCashDiff = computed(() =>
    (this.operatorPerf()?.operators ?? []).reduce((s, o) => s + o.cashDifferenceCents, 0),
  );

  // ── Auth ────────────────────────────────────────────────────────────────────
  protected readonly isAdmin = computed(() => this.auth.role() === 'admin');

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
    const initialPreset: DateRangePreset = 'last30';
    const range = this.reportsForms.rangeForPreset(initialPreset)!;
    this.filterForm = this.reportsForms.createReportFilterForm({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      preset: initialPreset,
      compare: false,
    });

    // Tab default según rol
    this.tab.set(this.isAdmin() ? 'accounting' : 'revenue');

    void this.loadReport();
  }

  // ── Acciones de UI ──────────────────────────────────────────────────────────
  protected applyPreset(preset: DateRangePreset): void {
    this.filterForm.patchValue({ preset }, { emitEvent: false });
    if (preset !== 'custom') {
      const range = this.reportsForms.rangeForPreset(preset);
      if (range) {
        this.filterForm.patchValue(
          { dateFrom: range.dateFrom, dateTo: range.dateTo },
          { emitEvent: false },
        );
      }
      void this.loadReport();
    }
  }

  protected onCustomDateChange(): void {
    this.filterForm.patchValue({ preset: 'custom' }, { emitEvent: false });
  }

  protected toggleCompare(): void {
    const next = !this.filterForm.value.compare;
    this.filterForm.patchValue({ compare: next }, { emitEvent: false });
    void this.loadReport();
  }

  protected setTab(t: Tab): void {
    if (t === this.tab()) return;
    this.tab.set(t);
    void this.loadReport();
  }

  protected expandToLast30(): void {
    this.applyPreset('last30');
  }

  // ── Carga ──────────────────────────────────────────────────────────────────
  async loadReport(): Promise<void> {
    if (!this.filterForm || this.filterForm.invalid) return;
    this.loading.set(true);
    this.errorMsg.set(null);

    const range: DateRange = {
      dateFrom: this.filterForm.value.dateFrom,
      dateTo: this.filterForm.value.dateTo,
    };
    const groupBy: GroupBy = this.filterForm.value.groupBy as GroupBy;
    const compare = !!this.filterForm.value.compare;
    const role = this.auth.role() ?? 'operador';
    const activeTab = this.tab();

    const { from, to } = this.toUtcRange(range);

    // ── Always load revenue + vehicles (cheap, used by accounting too) ──
    const [revRes, vehRes] = await Promise.all([
      this.revenueUC.execute({ dateFrom: from, dateTo: to, groupBy }),
      this.sessionTypesUC.execute({ dateFrom: from, dateTo: to }),
    ]);

    revRes.fold(
      (f) => {
        this.errorMsg.set(f.message);
        this.toast.error(`Error en ingresos: ${f.message}`);
        this.revenue.set(null);
      },
      (r) => this.revenue.set(r),
    );
    vehRes.fold(
      (f) => {
        this.toast.error(`Error en vehículos: ${f.message}`);
        this.sessionsByType.set(null);
      },
      (r) => this.sessionsByType.set(r),
    );

    // ── Operadores (admin) ──
    if (role === 'admin') {
      const opRes = await this.operatorUC.execute({ dateFrom: from, dateTo: to, userRole: role });
      opRes.fold(
        (f) => this.toast.error(`Error en operadores: ${f.message}`),
        (r) => this.operatorPerf.set(r),
      );
    } else {
      this.operatorPerf.set(null);
    }

    // ── Comparativa con período previo ──
    if (compare) {
      const prev = this.reportsForms.previousRange(range);
      const { from: pFrom, to: pTo } = this.toUtcRange(prev);
      const [prevRev, prevVeh] = await Promise.all([
        this.revenueUC.execute({ dateFrom: pFrom, dateTo: pTo, groupBy }),
        this.sessionTypesUC.execute({ dateFrom: pFrom, dateTo: pTo }),
      ]);
      prevRev.fold(() => this.revenuePrev.set(null), (r) => this.revenuePrev.set(r));
      prevVeh.fold(() => this.sessionsPrev.set(null), (r) => this.sessionsPrev.set(r));
    } else {
      this.revenuePrev.set(null);
      this.sessionsPrev.set(null);
    }

    this.loading.set(false);
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  async exportCsv(): Promise<void> {
    if (!this.filterForm || this.filterForm.invalid) return;
    this.loading.set(true);

    const range: DateRange = {
      dateFrom: this.filterForm.value.dateFrom,
      dateTo: this.filterForm.value.dateTo,
    };
    const { from, to } = this.toUtcRange(range);
    const role = this.auth.role() ?? 'operador';
    const entity = this.tab() === 'vehicles' ? 'sessions' : 'payments';

    const result = await this.exportUC.execute({ entity, dateFrom: from, dateTo: to, userRole: role });
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

  // ── Helpers ────────────────────────────────────────────────────────────────
  private toUtcRange(range: DateRange): { from: Date; to: Date } {
    return {
      from: new Date(range.dateFrom + 'T00:00:00-05:00'),
      to: new Date(range.dateTo + 'T23:59:59-05:00'),
    };
  }

  private deltaFor(current: number | undefined, previous: number | undefined): Delta {
    const cur = current ?? 0;
    const prev = previous ?? 0;
    if (!this.compareEnabled()) return { pct: null, abs: 0, isNew: false };
    const abs = cur - prev;
    if (prev === 0 && cur > 0) return { pct: null, abs, isNew: true };
    if (prev === 0 && cur === 0) return { pct: 0, abs: 0, isNew: false };
    const pct = Math.round(((cur - prev) / prev) * 100);
    return { pct, abs, isNew: false };
  }

  protected methodLabel(m: string): string {
    return this.methodLabels[m] ?? m;
  }
  protected vehicleLabel(v: string): string {
    return this.vehicleLabels[v] ?? v;
  }
  protected pctOfMethodTotal(amountCents: number): number {
    return pctOf(amountCents, this.methodTotalCents());
  }

  protected barWidth(value: number, max: number): number {
    return calcBarWidth(value, max, 2);
  }

  protected formatBogotaDay(label: string): string {
    return formatBogotaDay(label);
  }

  /** True cuando "más es mejor" (verde si delta positivo). */
  protected deltaIsGood(delta: Delta, higherIsBetter: boolean): boolean {
    if (delta.pct === null && !delta.isNew) return false;
    if (delta.isNew) return higherIsBetter;
    return higherIsBetter ? delta.pct! >= 0 : delta.pct! <= 0;
  }
}
