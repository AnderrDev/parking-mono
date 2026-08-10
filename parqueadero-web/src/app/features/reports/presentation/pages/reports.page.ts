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
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule, LUCIDE_ICONS, LucideIconProvider,
  ClipboardList, CircleDollarSign, Car, Users, History,
  CircleHelp, TrendingUp, TrendingDown, TriangleAlert, Clock,
  ChevronDown, ChevronRight, RefreshCw,
} from 'lucide-angular';
import { AuthStateService } from '../../../../core/services/auth-state.service';
import { ReportsForms, DateRangePreset, DateRange } from '../forms/reports.forms';
import {
  GET_REVENUE_BY_PERIOD_TOKEN,
  GET_SESSIONS_BY_TYPE_TOKEN,
  GET_OPERATOR_PERFORMANCE_TOKEN,
  LIST_SHIFTS_TOKEN,
  LIST_SHIFT_PAYMENTS_TOKEN,
} from '../../../../core/di/injection-tokens';
import { GetRevenueByPeriodUseCase } from '../../domain/usecases/get-revenue-by-period.usecase';
import { GetSessionsByTypeUseCase } from '../../domain/usecases/get-sessions-by-type.usecase';
import { GetOperatorPerformanceUseCase } from '../../domain/usecases/get-operator-performance.usecase';
import { ListShiftsUseCase } from '../../../cashier/domain/usecases/list-shifts.usecase';
import { ShiftWithOperator } from '../../../cashier/domain/repositories/cashier.repository';
import { ListShiftPaymentsUseCase } from '../../../payments/domain/usecases/list-shift-payments.usecase';
import { PaymentWithVehicle } from '../../../payments/domain/repositories/payment.repository';
import {
  RevenueReportResult,
  SessionsByTypeResult,
  OperatorPerformanceResult,
  GroupBy,
} from '../../domain/repositories/report.repository';
import { ToastService } from '../../../../core/services/toast.service';
import { CurrencyCopPipe } from '../../../../shared/pipes/currency-cop.pipe';
import { barWidth as calcBarWidth, pctOf } from '../../../../shared/utils/chart.utils';
import { formatBogotaDay, formatDateBogota, formatTimeBogota, durationMinutes, formatDuration } from '../../../../shared/utils/date.utils';
import { paymentMethodLabel, paymentChannel, PaymentChannel } from '../../../../shared/utils/payment-method.utils';
import { PaymentMethodStackComponent } from '../components/payment-method-stack.component';

const LARGE_DIFF_CENTS = 500_000;

type Tab = 'accounting' | 'revenue' | 'vehicles' | 'operators' | 'shifts';

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
    RouterLink,
    CurrencyCopPipe,
    PaymentMethodStackComponent,
    LucideAngularModule,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      useValue: new LucideIconProvider({
        ClipboardList, CircleDollarSign, Car, Users, History,
        CircleHelp, TrendingUp, TrendingDown, TriangleAlert, Clock,
        ChevronDown, ChevronRight, RefreshCw,
      }),
      multi: true,
    },
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
  protected readonly shiftClosures = signal<ShiftWithOperator[] | null>(null);
  // Detalle expandible: movimientos (pagos) del turno seleccionado
  protected readonly expandedShiftId = signal<string | null>(null);
  protected readonly expandedShiftPayments = signal<PaymentWithVehicle[] | null>(null);
  protected readonly expandedShiftLoading = signal(false);
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

  // 'custom' no es chip: editar las fechas activa ese modo solo. 'last30' quedó
  // reservado al botón "Ampliar a últimos 30 días" de los estados vacíos.
  protected readonly presetOptions: DateRangePreset[] = [
    'today', 'week', 'month', 'lastMonth',
  ];

  // ── Computed: KPIs ──────────────────────────────────────────────────────────
  // NOTA: compareEnabled/dateRangeInvalid son métodos planos (no computed()) porque
  // leen filterForm.value, que no es un signal — un computed() que solo lee estado
  // no-signal se memoriza en su primer valor y nunca se vuelve a evaluar. Como
  // métodos, Angular los reinvoca en cada ciclo de detección de cambios (OnPush
  // sigue re-chequeando el componente en los eventos de su propia plantilla).
  protected compareEnabled(): boolean {
    return !!this.filterForm?.value?.compare;
  }

  /** Mensaje de error del rango, o null si es consultable. */
  protected rangeErrorMsg(): string | null {
    const v = this.filterForm?.value as { dateFrom?: string; dateTo?: string } | undefined;
    if (!v?.dateFrom || !v?.dateTo) return 'Selecciona ambas fechas para consultar.';
    if (v.dateFrom > v.dateTo) return 'La fecha "Desde" debe ser anterior o igual a "Hasta".';
    return null;
  }

  /** true cuando el rango de fechas del formulario no es consultable (vacío o desde > hasta). */
  protected dateRangeInvalid(): boolean {
    return this.rangeErrorMsg() !== null;
  }

  /** Resumen legible del rango en pantalla: "sáb 12 jul → sáb 09 ago · 30 días". */
  protected rangeSummary(): string {
    const v = this.filterForm?.value as { dateFrom?: string; dateTo?: string } | undefined;
    if (!v?.dateFrom || !v?.dateTo) return '';
    if (v.dateFrom === v.dateTo) return formatBogotaDay(v.dateFrom);
    const parse = (iso: string): Date => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y!, m! - 1, d!, 12, 0, 0, 0);
    };
    const days = Math.round((parse(v.dateTo).getTime() - parse(v.dateFrom).getTime()) / 86_400_000) + 1;
    return `${formatBogotaDay(v.dateFrom)} → ${formatBogotaDay(v.dateTo)} · ${days} días`;
  }

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

  // Entradas por hora del día (tab Vehículos)
  protected readonly maxHourCount = computed(() =>
    Math.max(1, ...(this.sessionsByType()?.byHour ?? []).map((h) => h.count)),
  );

  // Cierres de caja: extras
  protected readonly closedShifts = computed(() =>
    (this.shiftClosures() ?? []).filter((s) => s.shift.status === 'closed'),
  );
  protected readonly shiftsClosedCount = computed(() => this.closedShifts().length);
  protected readonly totalShiftDiffCents = computed(() =>
    this.closedShifts().reduce((s, item) => s + Math.abs(item.shift.differenceCents ?? 0), 0),
  );
  protected readonly largeDiffShiftsCount = computed(() =>
    this.closedShifts().filter((item) => Math.abs(item.shift.differenceCents ?? 0) > LARGE_DIFF_CENTS).length,
  );

  /** `/cashier/history` está restringida a admin/contador (requireRole en cashier.routes.ts) — el link solo se muestra si el rol actual puede entrar. */
  protected readonly canViewFullShiftHistory = computed(() =>
    ['admin', 'contador'].includes(this.auth.role() ?? ''),
  );

  constructor(
    private readonly reportsForms: ReportsForms,
    private readonly auth: AuthStateService,
    @Inject(GET_REVENUE_BY_PERIOD_TOKEN) private readonly revenueUC: GetRevenueByPeriodUseCase,
    @Inject(GET_SESSIONS_BY_TYPE_TOKEN) private readonly sessionTypesUC: GetSessionsByTypeUseCase,
    @Inject(GET_OPERATOR_PERFORMANCE_TOKEN) private readonly operatorUC: GetOperatorPerformanceUseCase,
    @Inject(LIST_SHIFTS_TOKEN) private readonly listShiftsUC: ListShiftsUseCase,
    @Inject(LIST_SHIFT_PAYMENTS_TOKEN) private readonly listShiftPaymentsUC: ListShiftPaymentsUseCase,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    // "Este mes" como default: es el rango natural de la vista contable
    // (antes era "últimos 30 días", un corte arbitrario difícil de cuadrar).
    const initialPreset: DateRangePreset = 'month';
    const range = this.reportsForms.rangeForPreset(initialPreset)!;
    this.filterForm = this.reportsForms.createReportFilterForm({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      preset: initialPreset,
      compare: false,
    });

    this.tab.set('accounting');

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

  /** Editar una fecha = modo personalizado; consulta de una vez si el rango es válido. */
  protected onCustomDateChange(): void {
    this.filterForm.patchValue({ preset: 'custom' }, { emitEvent: false });
    if (!this.dateRangeInvalid()) void this.loadReport();
  }

  protected toggleCompare(): void {
    const next = !this.filterForm.value.compare;
    this.filterForm.patchValue({ compare: next }, { emitEvent: false });
    void this.loadReport();
  }

  // Cambiar de tab NO re-consulta: loadReport() ya trae los datos de todos los
  // tabs para el rango vigente; volver a pedirlos aquí solo repetía queries.
  protected setTab(t: Tab): void {
    this.tab.set(t);
  }

  protected expandToLast30(): void {
    this.applyPreset('last30');
  }

  /** Expande/colapsa el detalle de movimientos (pagos) de un cierre de caja. */
  protected async toggleShiftExpand(shiftId: string): Promise<void> {
    if (this.expandedShiftId() === shiftId) {
      this.expandedShiftId.set(null);
      this.expandedShiftPayments.set(null);
      return;
    }
    this.expandedShiftId.set(shiftId);
    this.expandedShiftPayments.set(null);
    this.expandedShiftLoading.set(true);
    const result = await this.listShiftPaymentsUC.execute({ shiftId });
    this.expandedShiftLoading.set(false);
    result.fold(
      (f) => {
        this.toast.error(`Error al cargar movimientos: ${f.message}`);
        this.expandedShiftPayments.set([]);
      },
      (payments) => this.expandedShiftPayments.set(payments),
    );
  }

  // ── Carga ──────────────────────────────────────────────────────────────────
  async loadReport(): Promise<void> {
    if (!this.filterForm || this.filterForm.invalid) return;
    if (this.dateRangeInvalid()) return; // el error se muestra inline en los filtros
    this.loading.set(true);
    this.errorMsg.set(null);
    // Un turno expandido puede no existir en el nuevo rango — colapsar.
    this.expandedShiftId.set(null);
    this.expandedShiftPayments.set(null);

    const range: DateRange = {
      dateFrom: this.filterForm.value.dateFrom,
      dateTo: this.filterForm.value.dateTo,
    };
    const groupBy: GroupBy = this.filterForm.value.groupBy as GroupBy;
    const compare = !!this.filterForm.value.compare;
    const role = this.auth.role() ?? 'operador';

    const { from, to } = this.toUtcRange(range);

    // ── Always load revenue + vehicles (cheap, used by accounting too) ──
    const [revRes, vehRes, shiftsRes] = await Promise.all([
      this.revenueUC.execute({ dateFrom: from, dateTo: to, groupBy }),
      this.sessionTypesUC.execute({ dateFrom: from, dateTo: to }),
      this.listShiftsUC.execute({ dateFrom: from, dateTo: to, page: 1, pageSize: 100 }),
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
    shiftsRes.fold(
      (f) => {
        this.toast.error(`Error en cierres de caja: ${f.message}`);
        this.shiftClosures.set(null);
      },
      (r) => this.shiftClosures.set(r.data),
    );

    // ── Operadores ──
    const opRes = await this.operatorUC.execute({ dateFrom: from, dateTo: to, userRole: role });
    opRes.fold(
      (f) => this.toast.error(`Error en operadores: ${f.message}`),
      (r) => this.operatorPerf.set(r),
    );

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
  /** Label granular por método (Nequi, Tarjeta crédito, etc.) para la lista de movimientos — distinto de methodLabel(), que agrupa en las 4 categorías del stack de "Cómo cobrás". */
  protected movementMethodLabel(m: string): string {
    return paymentMethodLabel(m);
  }
  /** Canal del movimiento — solo 'cash' cuenta para el cuadre de efectivo (Esperado/Contado) de la tabla de cierres. */
  protected movementChannel(m: string): PaymentChannel {
    return paymentChannel(m);
  }
  /** Hora de entrada del vehículo (sesión asociada al pago) — '—' si el pago no viene de una sesión (ej. mensualidad). */
  protected movementEntryLabel(p: PaymentWithVehicle): string {
    return p.entryAt ? this.shiftTimeLabel(p.entryAt) : '—';
  }
  /** Cuánto estuvo parqueado el vehículo antes de este pago (entrada → hora del pago). */
  protected movementDurationLabel(p: PaymentWithVehicle): string {
    return p.entryAt ? formatDuration(durationMinutes(p.entryAt, p.payment.paidAt)) : '—';
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

  // ── Cierres de caja: fecha/hora separadas para que se lea de un vistazo
  // cuándo empezó/terminó cada turno, sin confundir turnos consecutivos con
  // cajas simultáneas (la regla de negocio es caja global: un turno cierra y
  // el siguiente abre casi al instante) ──
  protected shiftDateLabel(date: Date): string {
    return formatDateBogota(date, 'EEE dd/MM');
  }
  protected shiftTimeLabel(date: Date): string {
    return formatTimeBogota(date);
  }
  protected shiftDurationLabel(item: ShiftWithOperator): string {
    return formatDuration(durationMinutes(item.shift.openedAt, item.shift.closedAt!));
  }

  /** True cuando "más es mejor" (verde si delta positivo). */
  protected deltaIsGood(delta: Delta, higherIsBetter: boolean): boolean {
    if (delta.pct === null && !delta.isNew) return false;
    if (delta.isNew) return higherIsBetter;
    return higherIsBetter ? delta.pct! >= 0 : delta.pct! <= 0;
  }
}
