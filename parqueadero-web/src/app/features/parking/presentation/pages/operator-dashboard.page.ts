import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
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
} from '../../../../core/di/injection-tokens';
import { AuthStateService } from '../../../../core/services/auth-state.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { ParkingSessionEntity, VehicleType } from '../../domain/entities/parking-session.entity';
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
import { VehicleSearchResult } from '../../domain/repositories/parking.repository';
import { VehicleEntity } from '../../domain/entities/vehicle.entity';
import {
  CalculateParkingFeeUseCase,
} from '../../domain/usecases/calculate-parking-fee.usecase';
import { RequestInvoiceUseCase } from '../../../invoicing/domain/usecases/request-invoice.usecase';
import {
  VehicleEntryFormComponent,
  VehicleEntryFormValue,
} from '../components/vehicle-entry-form.component';
import {
  VehicleExitDialogComponent,
  VehicleExitDialogData,
  ExitFormValue,
} from '../components/vehicle-exit-dialog.component';
import { formatDuration } from '../../../../shared/utils/date.utils';
import { formatCOP } from '../../../../shared/utils/currency.utils';

const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  carro: 'Carro',
  moto: 'Moto',
  bicicleta: 'Bicicleta',
  otro: 'Otro',
};

interface ExitReceipt {
  plate: string;
  vehicleType: VehicleType;
  entryAt: Date;
  exitAt: Date;
  durationMinutes: number;
  amountCents: number;
  paymentMethod: string;
  cashReceivedCents: number | null;
}

@Component({
  selector: 'app-operator-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VehicleEntryFormComponent, LoadingSpinnerComponent],
  templateUrl: './operator-dashboard.page.html',
  styleUrl: './operator-dashboard.page.scss',
})
export class OperatorDashboardPageComponent implements OnInit, OnDestroy {
  readonly entryLoading = signal(false);
  readonly sessionsLoading = signal(false);
  readonly activeSessions = signal<ParkingSessionEntity[]>([]);
  readonly monthlyPlanWarning = signal<string | null>(null);
  readonly lastReceipt = signal<ExitReceipt | null>(null);

  readonly clockNow = signal(this.formatNow());

  readonly monthlyCount = computed(
    () => this.activeSessions().filter(s => s.isMonthly).length,
  );

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

  readonly formatDuration = formatDuration;
  readonly formatCOP = formatCOP;

  protected readonly entryFormCmp = viewChild<VehicleEntryFormComponent>('entryForm');

  private clockTimer: ReturnType<typeof setInterval> | null = null;

  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

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
    private readonly _calculateFee: CalculateParkingFeeUseCase,
    readonly authState: AuthStateService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadSessions();
    this.clockTimer = setInterval(() => this.clockNow.set(this.formatNow()), 1000);
  }

  ngOnDestroy(): void {
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.plateSearchTimer) clearTimeout(this.plateSearchTimer);
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
      const result = await this.searchPlateSuggestions.execute({ query: value });
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
    this.plateSearchQuery.set('');
    this.plateSearchResult.set(null);
    this.plateSearchError.set(null);
    this.plateSuggestions.set([]);
    this.plateSuggestionsOpen.set(false);
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

        this.lastReceipt.set({
          plate: closedSession.vehiclePlate,
          vehicleType: closedSession.vehicleType,
          entryAt: closedSession.entryAt,
          exitAt: closedSession.exitAt ?? new Date(),
          durationMinutes: closedSession.durationMinutes,
          amountCents: amount,
          paymentMethod: value.paymentMethod,
          cashReceivedCents: value.cashReceivedCents,
        });

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
    this.lastReceipt.set(null);
  }

  protected printReceipt(r: ExitReceipt): void {
    const w = window.open('', '_blank', 'width=420,height=620');
    if (!w) return;
    w.document.write(this.buildReceiptHtml(r));
    w.document.close();
    w.focus();
    w.print();
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

  async onEntrySubmit(value: VehicleEntryFormValue): Promise<void> {
    const user = this.authState.currentUser();
    if (!user) return;

    this.entryLoading.set(true);
    this.monthlyPlanWarning.set(null);

    const result = await this.registerEntry.execute({
      plate: value.plate,
      vehicleType: value.vehicleType,
      color: value.color,
      brand: value.brand,
      userId: user.id,
    });

    this.entryLoading.set(false);

    result.fold(
      (failure) => {
        if (failure instanceof ValidationFailure || failure instanceof BusinessRuleFailure) {
          this.toast.error(failure.message);
        } else if (failure instanceof NetworkFailure) {
          this.toast.warning('Sin conexión. La entrada se guardará cuando haya red.');
        } else if (failure instanceof ServerFailure) {
          this.toast.error(`Error al registrar entrada: ${failure.message}`);
        } else {
          this.toast.error('Error inesperado. Intenta de nuevo.');
        }
      },
      ({ session, monthlyPlanWarning }) => {
        this.lastReceipt.set(null);
        this.activeSessions.update((prev) => [session, ...prev]);
        this.toast.success(
          `Vehículo ${session.vehiclePlate} registrado a las ${session.entryAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`,
        );
        if (monthlyPlanWarning) {
          this.monthlyPlanWarning.set(monthlyPlanWarning);
        }
        this.entryFormCmp()?.resetForm();
      },
    );
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
