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
  SEARCH_VEHICLE_BY_PLATE_TOKEN,
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
import { VehicleSearchResult } from '../../domain/repositories/parking.repository';
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

const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  carro: 'Carro',
  moto: 'Moto',
  bicicleta: 'Bicicleta',
  otro: 'Otro',
};

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

  readonly clockNow = signal(this.formatNow());

  readonly monthlyCount = computed(
    () => this.activeSessions().filter(s => s.isMonthly).length,
  );

  // HU-014: buscador por placa
  readonly plateSearchQuery = signal('');
  readonly plateSearchLoading = signal(false);
  readonly plateSearchResult = signal<VehicleSearchResult | null>(null);
  readonly plateSearchError = signal<string | null>(null);
  private plateSearchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly formatDuration = formatDuration;

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

  // HU-014: búsqueda con debounce 300ms
  protected onPlateSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.plateSearchQuery.set(value);

    if (this.plateSearchTimer) clearTimeout(this.plateSearchTimer);
    if (value.length < 3) {
      this.plateSearchResult.set(null);
      this.plateSearchError.set(null);
      return;
    }

    this.plateSearchTimer = setTimeout(async () => {
      this.plateSearchLoading.set(true);
      this.plateSearchError.set(null);
      const result = await this.searchByPlate.execute({ plate: value });
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
    }, 300);
  }

  protected clearPlateSearch(): void {
    if (this.plateSearchTimer) clearTimeout(this.plateSearchTimer);
    this.plateSearchQuery.set('');
    this.plateSearchResult.set(null);
    this.plateSearchError.set(null);
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

  openExitDialog(session: ParkingSessionEntity): void {
    const ref = this.dialog.open<ExitFormValue | undefined, VehicleExitDialogData>(
      VehicleExitDialogComponent,
      {
        data: { session, tariff: null, feeResult: null },
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
        const amountStr = amount > 0 ? ` — $${amount.toLocaleString('es-CO')} COP` : ' — Sin cobro';

        // HU-029: si pagó en efectivo, mostrar el cambio en el toast de éxito.
        let changeStr = '';
        if (value.paymentMethod === 'efectivo' && value.cashReceivedCents !== null && amount > 0) {
          const change = value.cashReceivedCents - amount;
          if (change > 0) {
            changeStr = ` · Cambio $${change.toLocaleString('es-CO')}`;
          }
        }
        this.toast.success(`Vehículo ${closedSession.vehiclePlate} salió${amountStr}${changeStr}`);

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
