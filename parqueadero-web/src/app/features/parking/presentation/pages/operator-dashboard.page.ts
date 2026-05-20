import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  HostListener,
  Inject,
  OnDestroy,
  OnInit,
  ViewContainerRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import {
  BusinessRuleFailure,
  NetworkFailure,
  NotFoundFailure,
  ServerFailure,
  ValidationFailure,
} from '../../../../core/either/failures';
import {
  REGISTER_VEHICLE_ENTRY_TOKEN,
  REGISTER_VEHICLE_EXIT_TOKEN,
  GET_ACTIVE_SESSIONS_TOKEN,
  GET_ACTIVE_TARIFF_TOKEN,
  SEARCH_VEHICLE_BY_PLATE_TOKEN,
  SEARCH_PLATE_SUGGESTIONS_TOKEN,
  REQUEST_INVOICE_TOKEN,
  GET_OPEN_SHIFT_STATUS_TOKEN,
  GET_VEHICLE_HISTORY_STATS_TOKEN,
  LIST_MONTHLY_PLANS_TOKEN,
} from '../../../../core/di/injection-tokens';
import { AuthStateService } from '../../../../core/services/auth-state.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { ParkingSessionEntity, VehicleType } from '../../domain/entities/parking-session.entity';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import { NoParams } from '../../../../core/base/usecase';
import {
  RegisterVehicleEntryUseCase,
} from '../../domain/usecases/register-vehicle-entry.usecase';
import {
  RegisterVehicleExitUseCase,
} from '../../domain/usecases/register-vehicle-exit.usecase';
import {
  GetActiveSessionsUseCase,
} from '../../domain/usecases/get-active-sessions.usecase';
import {
  SearchVehicleByPlateUseCase,
} from '../../domain/usecases/search-vehicle-by-plate.usecase';
import {
  SearchPlateSuggestionsUseCase,
} from '../../domain/usecases/search-plate-suggestions.usecase';
import {
  GetActiveTariffUseCase,
} from '../../domain/usecases/get-active-tariff.usecase';
import {
  GetOpenShiftStatusUseCase,
  OpenShiftStatus,
} from '../../domain/usecases/get-open-shift-status.usecase';
import {
  GetVehicleHistoryStatsUseCase,
} from '../../domain/usecases/get-vehicle-history-stats.usecase';
import { VehicleHistoryStats } from '../../domain/entities/vehicle-history-stats.entity';
import { ListMonthlyPlansUseCase } from '../../../monthly-plans/domain/usecases/list-monthly-plans.usecase';
import { MonthlyPlanEntity } from '../../domain/entities/monthly-plan.entity';
import { VehicleSearchResult } from '../../domain/repositories/parking.repository';
import { VehicleEntity } from '../../domain/entities/vehicle.entity';
import {
  CalculateParkingFeeUseCase,
} from '../../domain/usecases/calculate-parking-fee.usecase';
import { RequestInvoiceUseCase } from '../../../invoicing/domain/usecases/request-invoice.usecase';
import {
  VehicleEntryModalComponent,
  VehicleEntryModalData,
  VehicleEntryModalResult,
} from '../components/vehicle-entry-modal.component';
import {
  VehicleExitDialogComponent,
  VehicleExitDialogData,
  ExitFormValue,
} from '../components/vehicle-exit-dialog.component';
import { ShiftStatusBannerComponent, ShiftBannerState } from '../components/shift-status-banner.component';
import { TariffsBarComponent } from '../components/tariffs-bar.component';
import { ReceiptCardComponent, ExitReceipt } from '../components/receipt-card.component';
import { VehicleHistoryPanelComponent } from '../components/vehicle-history-panel.component';
import { MonthlyPlansPanelComponent } from '../components/monthly-plans-panel.component';
import { formatDuration } from '../../../../shared/utils/date.utils';
import { formatCOP } from '../../../../shared/utils/currency.utils';

const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  carro: 'Carro',
  moto: 'Moto',
  bicicleta: 'Bicicleta',
  otro: 'Otro',
};

// ExitReceipt → ahora vive en `receipt-card.component.ts` y se importa.

@Component({
  selector: 'app-operator-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoadingSpinnerComponent,
    RouterLink,
    ShiftStatusBannerComponent,
    TariffsBarComponent,
    ReceiptCardComponent,
    VehicleHistoryPanelComponent,
    MonthlyPlansPanelComponent,
  ],
  templateUrl: './operator-dashboard.page.html',
  styleUrl: './operator-dashboard.page.scss',
})
export class OperatorDashboardPageComponent implements OnInit, OnDestroy {
  readonly sessionsLoading = signal(false);
  readonly activeSessions = signal<ParkingSessionEntity[]>([]);
  readonly monthlyPlanWarning = signal<string | null>(null);
  readonly lastReceipt = signal<ExitReceipt | null>(null);


  // Estado de la caja del operador. Se carga al ngOnInit y bloquea la entrada
  // cuando no hay turno abierto. La regla server-side ya existe; esto es la
  // retroalimentación visual previa para evitar el viaje fallido.
  readonly shiftStatusLoading = signal(true);
  readonly shiftStatus = signal<OpenShiftStatus | null>(null);
  readonly shiftStatusError = signal<string | null>(null);
  readonly cashRegisterClosed = computed(() => {
    const s = this.shiftStatus();
    return s !== null && !s.isOpen;
  });
  readonly entryDisabled = computed(
    () => this.shiftStatusLoading() || this.cashRegisterClosed() || this.shiftStatusError() !== null,
  );

  /** Estado consolidado para `<app-shift-status-banner>`. */
  readonly shiftBannerState = computed<ShiftBannerState>(() => {
    if (this.shiftStatusLoading()) return 'loading';
    if (this.shiftStatusError() !== null) return 'error';
    if (this.cashRegisterClosed()) return 'closed';
    return 'open';
  });

  readonly clockNow = signal(this.formatNow());

  readonly monthlyCount = computed(
    () => this.activeSessions().filter(s => s.isMonthly).length,
  );

  // Tarifas vigentes para mostrar como referencia visible al operador y al
  // cliente, y para deshabilitar tipos sin tarifa en el form de entrada.
  // Se cargan en paralelo al ngOnInit.
  readonly visibleTariffTypes: VehicleType[] = ['carro', 'moto', 'bicicleta', 'otro'];
  readonly activeTariffs = signal<Map<VehicleType, TariffEntity>>(new Map());
  // null mientras se carga la primera vez; tras el primer load queda como
  // array (vacío si no hay ninguna tarifa). Distinguir "cargando" de "cargado
  // vacío" permite al form de entrada mostrar skeleton vs banner "sin tarifas".
  readonly tariffsLoaded = signal(false);
  readonly availableTypesForEntry = computed<VehicleType[] | null>(() =>
    this.tariffsLoaded() ? Array.from(this.activeTariffs().keys()) : null,
  );

  private receiptDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly RECEIPT_AUTO_DISMISS_MS = 12_000;

  // HU-014: buscador por placa con autocomplete
  readonly plateSearchQuery = signal('');
  readonly plateSearchLoading = signal(false);
  readonly plateSearchResult = signal<VehicleSearchResult | null>(null);
  readonly plateSearchError = signal<string | null>(null);
  readonly plateSuggestions = signal<VehicleEntity[]>([]);
  readonly plateSuggestionsOpen = signal(false);
  readonly plateSuggestionsLoading = signal(false);
  private plateSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private plateSearchSeq = 0;

  // HU-046: dossier histórico del vehículo seleccionado.
  readonly vehicleHistoryStats = signal<VehicleHistoryStats | null>(null);
  readonly vehicleHistoryLoading = signal(false);
  readonly vehicleHistoryError = signal<string | null>(null);
  private vehicleHistorySeq = 0;

  // HU-047: panel de mensualidades activas (active + expiring).
  readonly monthlyPlans = signal<MonthlyPlanEntity[]>([]);
  readonly monthlyPlansLoading = signal(true);
  readonly monthlyPlansError = signal<string | null>(null);

  readonly formatDuration = formatDuration;
  readonly formatCOP = formatCOP;

  // El modal de ingreso reemplaza al form inline. Tracking del modal abierto
  // para evitar dobles aperturas con el atajo de teclado. Tipo aproximado
  // (DialogRef es genérico y depende del componente abierto).
  private entryModalRef: { close: () => void } | null = null;

  private clockTimer: ReturnType<typeof setInterval> | null = null;

  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  /**
   * Para anclar el overlay del dialog en el árbol de vistas correcto.
   */
  private readonly vcr = inject(ViewContainerRef);
  /**
   * Crítico: CDK Dialog (`dialog.mjs:594`) construye el injector del
   * componente abierto a partir de `config.injector || vcr.injector`.
   * `vcr.injector` es el ElementInjector — NO traversa al EnvironmentInjector
   * del route, así que tokens como REGISTER_VEHICLE_ENTRY_TOKEN o
   * TICKET_RENDERER_TOKEN (provistos en parking.routes.ts) quedan invisibles
   * y revientan con NullInjectorError. Inyectar EnvironmentInjector aquí
   * sí entrega el del route (con sus providers); pasarlo explícito.
   */
  private readonly envInjector = inject(EnvironmentInjector);

  constructor(
    @Inject(REGISTER_VEHICLE_ENTRY_TOKEN)
    private readonly registerEntry: RegisterVehicleEntryUseCase,
    @Inject(REGISTER_VEHICLE_EXIT_TOKEN)
    private readonly registerExit: RegisterVehicleExitUseCase,
    @Inject(GET_ACTIVE_SESSIONS_TOKEN)
    private readonly getActiveSessions: GetActiveSessionsUseCase,
    @Inject(SEARCH_VEHICLE_BY_PLATE_TOKEN)
    private readonly searchByPlate: SearchVehicleByPlateUseCase,
    @Inject(SEARCH_PLATE_SUGGESTIONS_TOKEN)
    private readonly searchPlateSuggestions: SearchPlateSuggestionsUseCase,
    @Inject(GET_ACTIVE_TARIFF_TOKEN)
    private readonly getActiveTariff: GetActiveTariffUseCase,
    @Inject(REQUEST_INVOICE_TOKEN)
    private readonly requestInvoice: RequestInvoiceUseCase,
    @Inject(GET_OPEN_SHIFT_STATUS_TOKEN)
    private readonly getOpenShiftStatus: GetOpenShiftStatusUseCase,
    @Inject(GET_VEHICLE_HISTORY_STATS_TOKEN)
    private readonly getVehicleHistoryStats: GetVehicleHistoryStatsUseCase,
    @Inject(LIST_MONTHLY_PLANS_TOKEN)
    private readonly listMonthlyPlans: ListMonthlyPlansUseCase,
    private readonly _calculateFee: CalculateParkingFeeUseCase,
    readonly authState: AuthStateService,
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadShiftStatus(),
      this.loadSessions(),
      this.loadTariffs(),
      this.loadMonthlyPlans(),
    ]);
    this.clockTimer = setInterval(() => this.clockNow.set(this.formatNow()), 1000);
  }

  /** HU-047: carga mensualidades activas + próximas a vencer. */
  async loadMonthlyPlans(): Promise<void> {
    this.monthlyPlansLoading.set(true);
    this.monthlyPlansError.set(null);
    const [activeRes, expiringRes] = await Promise.all([
      this.listMonthlyPlans.execute({
        status: 'active',
        pagination: { page: 1, pageSize: 50 },
      }),
      this.listMonthlyPlans.execute({
        status: 'expiring',
        pagination: { page: 1, pageSize: 50 },
      }),
    ]);
    this.monthlyPlansLoading.set(false);

    if (activeRes.isLeft()) {
      this.monthlyPlansError.set(
        activeRes.fold((f) => f.message, () => 'Error desconocido'),
      );
      this.monthlyPlans.set([]);
      return;
    }
    const combined: MonthlyPlanEntity[] = [];
    activeRes.fold(() => null, (r) => combined.push(...r.data));
    expiringRes.fold(() => null, (r) => combined.push(...r.data));
    // Deduplicar por id (un plan no debería aparecer dos veces, pero por
    // si la BD marcó status='active' y la consulta de 'expiring' lo trae
    // por otra ruta).
    const seen = new Set<string>();
    const dedup = combined.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    this.monthlyPlans.set(dedup);
  }

  /** Click en una fila del panel de mensualidades → rellenar el buscador. */
  protected async onMonthlyPlanPlateSelected(plate: string): Promise<void> {
    this.plateSearchQuery.set(plate);
    this.plateSuggestionsOpen.set(false);
    this.plateSuggestions.set([]);
    this.plateSearchLoading.set(true);
    this.plateSearchError.set(null);

    void this.loadVehicleHistory(plate);

    const result = await this.searchByPlate.execute({ plate });
    this.plateSearchLoading.set(false);
    result.fold(
      (failure) => {
        this.plateSearchResult.set(null);
        this.plateSearchError.set(failure.message);
      },
      (data) => {
        this.plateSearchResult.set(data);
        this.plateSearchError.set(null);
      },
    );
  }

  private async loadTariffs(): Promise<void> {
    try {
      const results = await Promise.all(
        this.visibleTariffTypes.map((t) =>
          this.getActiveTariff.execute(t).then((r) => [t, r] as const),
        ),
      );
      const map = new Map<VehicleType, TariffEntity>();
      for (const [type, result] of results) {
        result.fold(
          () => { /* sin tarifa configurada para ese tipo: no mostrar */ },
          (tariff) => map.set(type, tariff),
        );
      }
      this.activeTariffs.set(map);
    } finally {
      this.tariffsLoaded.set(true);
    }
  }

  protected tariffPerHourCents(t: TariffEntity): number {
    switch (t.unit) {
      case 'minuto': return t.valueCents * 60;
      case 'hora': return t.valueCents;
      case 'fraccion': return t.valueCents * 2;
      case 'dia': return Math.round(t.valueCents / 24);
      case 'mensualidad': return 0;  // No aplica per-hour para mensualidad.
    }
  }

  protected tariffPerMinuteCents(t: TariffEntity): number {
    switch (t.unit) {
      case 'minuto': return t.valueCents;
      case 'hora': return Math.round(t.valueCents / 60);
      case 'fraccion': return Math.round(t.valueCents / 30);
      case 'dia': return Math.round(t.valueCents / 1440);
      case 'mensualidad': return 0;
    }
  }

  protected tariffsList(): { type: VehicleType; label: string; tariff: TariffEntity }[] {
    const map = this.activeTariffs();
    // 'otro' se omite del bar de tarifas visible (es un fallback técnico,
    // no algo que el cliente típico pregunte). Sigue contando para
    // availableTypesForEntry y deshabilita el chip si no hay tarifa.
    return this.visibleTariffTypes
      .filter((t) => t !== 'otro' && map.has(t))
      .map((t) => ({ type: t, label: VEHICLE_TYPE_LABEL[t], tariff: map.get(t)! }));
  }

  async loadShiftStatus(): Promise<void> {
    const userId = this.authState.currentUser()?.id;
    if (!userId) {
      this.shiftStatusLoading.set(false);
      return;
    }
    this.shiftStatusLoading.set(true);
    this.shiftStatusError.set(null);
    const result = await this.getOpenShiftStatus.execute({ userId });
    this.shiftStatusLoading.set(false);
    result.fold(
      (failure) => {
        this.shiftStatus.set(null);
        this.shiftStatusError.set(failure.message);
      },
      (status) => {
        this.shiftStatus.set(status);
        this.shiftStatusError.set(null);
      },
    );
  }

  protected formatShiftOpenedAt(d: Date): string {
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  ngOnDestroy(): void {
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.plateSearchTimer) clearTimeout(this.plateSearchTimer);
    if (this.receiptDismissTimer) clearTimeout(this.receiptDismissTimer);
  }

  // Programa auto-dismiss del comprobante para que no se quede colgado en
  // pantalla. Si el cajero quiere imprimirlo o leerlo de cerca, hace hover
  // o pulsa el botón antes de los 12 s.
  private scheduleReceiptDismiss(): void {
    if (this.receiptDismissTimer) clearTimeout(this.receiptDismissTimer);
    this.receiptDismissTimer = setTimeout(() => {
      this.lastReceipt.set(null);
      this.receiptDismissTimer = null;
    }, OperatorDashboardPageComponent.RECEIPT_AUTO_DISMISS_MS);
  }

  protected pauseReceiptDismiss(): void {
    if (this.receiptDismissTimer) {
      clearTimeout(this.receiptDismissTimer);
      this.receiptDismissTimer = null;
    }
  }

  protected resumeReceiptDismiss(): void {
    if (this.lastReceipt()) this.scheduleReceiptDismiss();
  }

  // HU-014: autocomplete con debounce. El input dispara una búsqueda de
  // sugerencias (lista de placas que coinciden); seleccionar una carga el detalle.
  protected onPlateSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.plateSearchQuery.set(value);
    this.plateSearchResult.set(null);
    this.plateSearchError.set(null);

    if (this.plateSearchTimer) clearTimeout(this.plateSearchTimer);
    if (value.length < 2) {
      this.plateSuggestions.set([]);
      this.plateSuggestionsOpen.set(false);
      return;
    }

    const seq = ++this.plateSearchSeq;
    this.plateSuggestionsLoading.set(true);
    this.plateSuggestionsOpen.set(true);

    this.plateSearchTimer = setTimeout(async () => {
      // En la vista del operador solo nos interesan placas que estén
      // actualmente DENTRO del parqueadero — no históricas.
      const result = await this.searchPlateSuggestions.execute({
        query: value,
        onlyActive: true,
      });
      if (seq !== this.plateSearchSeq) return;
      this.plateSuggestionsLoading.set(false);
      result.fold(
        (failure) => {
          this.plateSuggestions.set([]);
          this.plateSearchError.set(failure.message);
        },
        (vehicles) => {
          this.plateSuggestions.set(vehicles);
          this.plateSearchError.set(null);
        },
      );
    }, 250);
  }

  protected async onSelectSuggestion(vehicle: VehicleEntity): Promise<void> {
    this.plateSearchQuery.set(vehicle.plate);
    this.plateSuggestionsOpen.set(false);
    this.plateSuggestions.set([]);
    this.plateSearchLoading.set(true);
    this.plateSearchError.set(null);

    // HU-046: arrancar la carga del dossier en paralelo. Si la búsqueda
    // principal aún no terminó, el panel ya está mostrando las stats.
    void this.loadVehicleHistory(vehicle.plate);

    const result = await this.searchByPlate.execute({ plate: vehicle.plate });
    this.plateSearchLoading.set(false);
    result.fold(
      (failure) => {
        this.plateSearchResult.set(null);
        this.plateSearchError.set(failure.message);
      },
      (data) => {
        this.plateSearchResult.set(data);
        this.plateSearchError.set(null);
      },
    );
  }

  /** HU-046: carga las métricas históricas para la placa seleccionada. */
  private async loadVehicleHistory(plate: string): Promise<void> {
    const seq = ++this.vehicleHistorySeq;
    this.vehicleHistoryLoading.set(true);
    this.vehicleHistoryError.set(null);
    this.vehicleHistoryStats.set(null);

    const result = await this.getVehicleHistoryStats.execute({ plate });
    if (seq !== this.vehicleHistorySeq) return; // descartado por nueva selección

    this.vehicleHistoryLoading.set(false);
    result.fold(
      (failure) => {
        this.vehicleHistoryStats.set(null);
        this.vehicleHistoryError.set(failure.message);
      },
      (stats) => {
        this.vehicleHistoryStats.set(stats);
        this.vehicleHistoryError.set(null);
      },
    );
  }

  protected onPlateInputBlur(): void {
    // Pequeño delay para que el click sobre una sugerencia alcance a dispararse
    // antes de cerrar el dropdown.
    setTimeout(() => this.plateSuggestionsOpen.set(false), 150);
  }

  protected onPlateInputFocus(): void {
    if (this.plateSuggestions().length > 0) {
      this.plateSuggestionsOpen.set(true);
    }
  }

  protected vehicleTypeLabel(t: VehicleType): string {
    return VEHICLE_TYPE_LABEL[t];
  }

  protected clearPlateSearch(): void {
    if (this.plateSearchTimer) clearTimeout(this.plateSearchTimer);
    this.plateSearchSeq++;
    this.vehicleHistorySeq++;
    this.plateSearchQuery.set('');
    this.plateSearchResult.set(null);
    this.plateSearchError.set(null);
    this.plateSuggestions.set([]);
    this.plateSuggestionsOpen.set(false);
    this.vehicleHistoryStats.set(null);
    this.vehicleHistoryError.set(null);
    this.vehicleHistoryLoading.set(false);
  }

  protected formatDateShort(d: Date): string {
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  protected todayLabel(): string {
    const formatter = new Intl.DateTimeFormat('es-CO', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    return formatter.format(new Date());
  }

  protected vehicleLabel(t: VehicleType): string {
    return VEHICLE_TYPE_LABEL[t] ?? t;
  }

  protected formatTimeShort(d: Date): string {
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  private formatNow(): string {
    return new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  async openExitDialog(session: ParkingSessionEntity): Promise<void> {
    const exitAt = new Date();
    const durationMinutes = Math.max(
      1,
      Math.ceil((exitAt.getTime() - session.entryAt.getTime()) / 60_000),
    );

    let feeResult = null;
    let tariff = null;
    const tariffResult = await this.getActiveTariff.execute(session.vehicleType);
    tariffResult.fold(
      () => { /* abrir diálogo sin preview si la tarifa no está disponible */ },
      (t) => {
        tariff = t;
        const feeEither = this._calculateFee.calculate({
          durationMinutes,
          tariff: t,
          isMonthly: session.isMonthly,
          vehicleType: session.vehicleType,
        });
        feeResult = feeEither.fold(() => null, (f) => f);
      },
    );

    const ref = this.dialog.open<ExitFormValue | undefined, VehicleExitDialogData>(
      VehicleExitDialogComponent,
      {
        injector: this.envInjector,
        viewContainerRef: this.vcr,
        data: { session, tariff, feeResult },
        ariaLabelledBy: 'exit-dialog-title',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
        hasBackdrop: true,
      },
    );
    ref.closed.subscribe((result) => {
      if (result) {
        void this.onExitSubmit(session, result);
      }
    });
  }

  private async onExitSubmit(session: ParkingSessionEntity, value: ExitFormValue): Promise<void> {
    const user = this.authState.currentUser();
    if (!user) return;

    const result = await this.registerExit.execute({
      plate: session.vehiclePlate,
      paymentMethod: value.paymentMethod,
      justificationIfFree: value.justification || undefined,
      userId: user.id,
    });

    result.fold(
      (failure) => {
        if (failure instanceof ValidationFailure || failure instanceof BusinessRuleFailure) {
          this.toast.error(failure.message);
        } else if (failure instanceof NotFoundFailure) {
          this.toast.error(failure.message);
          void this.loadSessions();
        } else if (failure instanceof NetworkFailure) {
          this.toast.warning('Sin conexión. La salida se guardará cuando haya red.');
        } else if (failure instanceof ServerFailure) {
          this.toast.error(`Error al registrar salida: ${failure.message}`);
        } else {
          this.toast.error('Error inesperado. Intenta de nuevo.');
        }
      },
      ({ session: closedSession }) => {
        this.activeSessions.update((prev) => prev.filter((s) => s.id !== closedSession.id));
        const amount = closedSession.amountDueCents ?? 0;
        const amountStr = amount > 0 ? ` — ${formatCOP(amount)}` : ' — Sin cobro';

        // HU-029: si pagó en efectivo, mostrar el cambio en el toast de éxito.
        let changeStr = '';
        if (value.paymentMethod === 'efectivo' && value.cashReceivedCents !== null && amount > 0) {
          const change = value.cashReceivedCents - amount;
          if (change > 0) {
            changeStr = ` · Cambio ${formatCOP(change)}`;
          }
        }
        this.toast.success(`Vehículo ${closedSession.vehiclePlate} salió${amountStr}${changeStr}`);

        const receipt: ExitReceipt = {
          plate: closedSession.vehiclePlate,
          vehicleType: closedSession.vehicleType,
          entryAt: closedSession.entryAt,
          exitAt: closedSession.exitAt ?? new Date(),
          durationMinutes: closedSession.durationMinutes,
          amountCents: amount,
          paymentMethod: value.paymentMethod,
          cashReceivedCents: value.cashReceivedCents,
        };
        this.lastReceipt.set(receipt);
        this.scheduleReceiptDismiss();

        // HU-031 v1.1: auto-impresión del comprobante. Si el popup está
        // bloqueado, queda el botón manual en `<app-receipt-card>` como
        // fallback — informamos con un toast no-bloqueante.
        const printed = this.printReceipt(receipt);
        if (!printed) {
          this.toast.warning(
            'Popup bloqueado. Usa el botón "Imprimir comprobante" para reimprimir.',
          );
        }

        // HU-040: emitir factura electrónica si el operador la pidió.
        if (value.emitInvoice && value.customerId) {
          void this.emitInvoiceFor(closedSession.id, value.customerId);
        }
      },
    );
  }

  private async emitInvoiceFor(sessionId: string, customerId: string): Promise<void> {
    this.toast.info('Emitiendo factura electrónica...');
    const result = await this.requestInvoice.execute({ sessionId, customerId });
    result.fold(
      (failure) => this.toast.error(`No se pudo emitir factura: ${failure.message}`),
      (invoice) => this.toast.success(`Factura ${invoice.number} (${invoice.dianStatus})`),
    );
  }

  protected dismissReceipt(): void {
    if (this.receiptDismissTimer) {
      clearTimeout(this.receiptDismissTimer);
      this.receiptDismissTimer = null;
    }
    this.lastReceipt.set(null);
  }

  /**
   * Imprime el comprobante de salida en una ventana popup.
   * Retorna true si la ventana se abrió, false si el popup fue bloqueado
   * (para que el llamador decida cómo notificar). Auto-cierra el popup
   * 1s después de imprimir (mismo patrón que el ticket de entrada).
   */
  protected printReceipt(r: ExitReceipt): boolean {
    const w = window.open('', '_blank', 'width=420,height=620');
    if (!w) return false;
    w.document.write(this.buildReceiptHtml(r));
    w.document.close();
    w.focus();
    try {
      w.print();
    } catch {
      // Algunos navegadores cierran solos al print(); ignoramos.
    }
    setTimeout(() => {
      try {
        w.close();
      } catch {
        /* noop */
      }
    }, 1000);
    return true;
  }

  private buildReceiptHtml(r: ExitReceipt): string {
    const fmt = (d: Date) =>
      d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

    const dur = r.durationMinutes >= 60
      ? `${Math.floor(r.durationMinutes / 60)}h ${r.durationMinutes % 60}m`
      : `${r.durationMinutes}m`;

    const moneyFmt = (cents: number) => formatCOP(cents) + ' COP';

    const amountRow = r.amountCents > 0
      ? `<tr><td>Total</td><td><strong>${moneyFmt(r.amountCents)}</strong></td></tr>`
      : `<tr><td>Total</td><td><strong>Sin cobro</strong></td></tr>`;

    const cashRows = r.paymentMethod === 'efectivo' &&
      r.cashReceivedCents !== null && r.amountCents > 0
      ? `<tr><td>Efectivo recibido</td><td>${moneyFmt(r.cashReceivedCents)}</td></tr>
         <tr><td>Cambio</td><td>${moneyFmt(r.cashReceivedCents - r.amountCents)}</td></tr>`
      : '';

    const now = fmt(new Date());

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Comprobante ${r.plate}</title>
  <style>
    body { font-family: 'Courier New', monospace; font-size: 13px; margin: 0; padding: 20px; color: #111; }
    h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
    .sub { text-align: center; font-size: 11px; color: #555; margin-bottom: 16px; }
    .plate { font-size: 28px; font-weight: bold; text-align: center; letter-spacing: 0.12em; margin: 12px 0; border: 2px solid #111; padding: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    td { padding: 5px 2px; border-bottom: 1px dotted #ccc; }
    td:last-child { text-align: right; }
    .footer { margin-top: 20px; font-size: 10px; text-align: center; color: #888; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>PARQUEADERO</h1>
  <p class="sub">Comprobante de pago</p>
  <div class="plate">${r.plate}</div>
  <table>
    <tr><td>Tipo</td><td>${VEHICLE_TYPE_LABEL[r.vehicleType]}</td></tr>
    <tr><td>Entrada</td><td>${fmt(r.entryAt)}</td></tr>
    <tr><td>Salida</td><td>${fmt(r.exitAt)}</td></tr>
    <tr><td>Duración</td><td>${dur}</td></tr>
    ${amountRow}
    <tr><td>Método de pago</td><td>${r.paymentMethod}</td></tr>
    ${cashRows}
  </table>
  <p class="footer">Generado el ${now}</p>
</body>
</html>`;
  }

  /** Abre el modal de ingreso. Disparado por botón header, FAB o atajo `N`. */
  openEntryModal(): void {
    if (this.entryDisabled()) return;
    if (this.entryModalRef) return; // ya hay uno abierto

    const ref = this.dialog.open<VehicleEntryModalResult, VehicleEntryModalData>(
      VehicleEntryModalComponent,
      {
        injector: this.envInjector,
        viewContainerRef: this.vcr,
        data: {
          availableTypes: this.availableTypesForEntry(),
          tariffByType: this.activeTariffs(),
          isAdmin: this.authState.hasRole('admin'),
        },
        ariaLabelledBy: 'entry-modal-title',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
        hasBackdrop: true,
        disableClose: true, // backdrop NO cierra; cancelar/Esc piden confirm
      },
    );
    this.entryModalRef = { close: () => ref.close() };

    ref.closed.subscribe((result) => {
      this.entryModalRef = null;
      if (!result) return;
      this.handleEntryRegistered(result);
    });
  }

  private handleEntryRegistered(result: VehicleEntryModalResult): void {
    const { session, monthlyPlanWarning, ticketPrinted } = result;
    this.lastReceipt.set(null);
    this.activeSessions.update((prev) => [session, ...prev]);
    this.toast.success(
      `Vehículo ${session.vehiclePlate} registrado a las ${session.entryAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`,
    );
    if (monthlyPlanWarning) {
      this.monthlyPlanWarning.set(monthlyPlanWarning);
    }
    if (!ticketPrinted) {
      // No interrumpe — log silencioso. El ticket se puede reimprimir más
      // tarde desde la lista de sesiones (follow-up).
      console.warn('[entry] Ticket no imprimido (popup bloqueado o sin impresora).');
    }
  }

  /** Atajo de teclado `N` para abrir el modal de entrada. */
  @HostListener('window:keydown', ['$event'])
  protected onGlobalKeydown(event: KeyboardEvent): void {
    if (event.key !== 'n' && event.key !== 'N') return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (
      target.tagName === 'INPUT'
      || target.tagName === 'TEXTAREA'
      || target.isContentEditable
    )) return;
    if (this.entryModalRef) return;
    if (this.entryDisabled()) return;
    event.preventDefault();
    this.openEntryModal();
  }

  private async loadSessions(): Promise<void> {
    this.sessionsLoading.set(true);
    const result = await this.getActiveSessions.execute(new NoParams());
    this.sessionsLoading.set(false);

    result.fold(
      () => this.toast.error('No se pudieron cargar las sesiones activas'),
      ({ data }) => this.activeSessions.set(data),
    );
  }
}
