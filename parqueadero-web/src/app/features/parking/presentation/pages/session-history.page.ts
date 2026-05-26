import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  Inject,
  OnInit,
  ViewContainerRef,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import {
  CANCEL_SESSION_TOKEN,
  LIST_SESSIONS_TOKEN,
} from '../../../../core/di/injection-tokens';
import { ParkingForms } from '../forms/parking.forms';
import { ListSessionsUseCase } from '../../domain/usecases/list-sessions.usecase';
import { CancelParkingSessionUseCase } from '../../domain/usecases/cancel-session.usecase';
import {
  ParkingSessionEntity,
  VehicleType,
} from '../../domain/entities/parking-session.entity';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { AuthStateService } from '../../../../core/services/auth-state.service';
import { ToastService } from '../../../../core/services/toast.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { CurrencyCopPipe } from '../../../../shared/pipes/currency-cop.pipe';
import { CancelSessionDialogComponent } from '../components/cancel-session-dialog.component';

/** Subset mínimo de la tabla tariffs para calcular cobro proyectado. */
interface TariffRow {
  id: string;
  vehicle_type: VehicleType;
  per_minute_cents: number | null;
  per_hour_cents: number | null;
  plena_cents: number | null;
}

const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  carro: 'Carro',
  moto: 'Moto',
  bicicleta: 'Bicicleta',
  otro: 'Otro',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Activa',
  completed: 'Completada',
  cancelled: 'Anulada',
};

@Component({
  selector: 'app-session-history-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, CurrencyCopPipe],
  templateUrl: './session-history.page.html',
  styleUrl: './session-history.page.scss',
})
export class SessionHistoryPageComponent implements OnInit {
  protected readonly sessions = signal<ParkingSessionEntity[]>([]);
  protected readonly loading = signal(false);
  protected readonly pagination = signal<PaginationMeta | null>(null);
  /** Map tariff_id → tarifa, para calcular el cobro proyectado de sesiones
   *  activas (sin payment todavía). Cargado una sola vez en ngOnInit. */
  protected readonly tariffsById = signal<Map<string, TariffRow>>(new Map());
  /** Fallback por vehicle_type cuando la sesión no persistió tariff_id
   *  (bug legacy pre-2026-05-25). */
  protected readonly tariffsByType = signal<Map<VehicleType, TariffRow>>(new Map());
  /** Tick que refresca la duración mostrada de sesiones activas cada minuto. */
  private readonly clockTick = signal(0);

  filterForm!: FormGroup;
  protected currentPage = 1;
  private clockInterval: ReturnType<typeof setInterval> | null = null;

  private readonly parkingForms = inject(ParkingForms);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly authState = inject(AuthStateService);
  private readonly supabase = inject(SupabaseService);
  /** Anclar overlay del dialog en el árbol de vistas. */
  private readonly vcr = inject(ViewContainerRef);
  /** EnvironmentInjector del route para que el dialog vea providers route-scoped (ver operator-dashboard.page.ts). */
  private readonly envInjector = inject(EnvironmentInjector);

  constructor(
    @Inject(LIST_SESSIONS_TOKEN) private readonly listSessionsUC: ListSessionsUseCase,
    @Inject(CANCEL_SESSION_TOKEN) private readonly cancelUC: CancelParkingSessionUseCase,
  ) {}

  ngOnInit(): void {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    this.filterForm = this.parkingForms.createSessionHistoryFilterForm({
      dateFrom: weekAgo,
      dateTo: today,
    });
    void this.loadTariffs();
    this.load();
    // Refresca duración y cobro proyectado cada minuto para activas.
    this.clockInterval = setInterval(() => this.clockTick.update((v) => v + 1), 60_000);
  }

  ngOnDestroy(): void {
    if (this.clockInterval) clearInterval(this.clockInterval);
  }

  private async loadTariffs(): Promise<void> {
    const { data } = await this.supabase.client
      .from('tariffs')
      .select('id, vehicle_type, per_minute_cents, per_hour_cents, plena_cents')
      .eq('is_active', true)
      .eq('_deleted', false)
      .neq('unit', 'mensualidad');
    if (!data) return;
    const byId = new Map<string, TariffRow>();
    const byType = new Map<VehicleType, TariffRow>();
    for (const row of data as TariffRow[]) {
      byId.set(row.id, row);
      byType.set(row.vehicle_type, row);
    }
    this.tariffsById.set(byId);
    this.tariffsByType.set(byType);
  }

  protected vehicleLabel(t: VehicleType): string {
    return VEHICLE_TYPE_LABEL[t] ?? t;
  }

  protected statusLabel(s: string): string {
    return STATUS_LABEL[s] ?? s;
  }

  protected canCancel(session: ParkingSessionEntity): boolean {
    return session.status !== 'cancelled' && this.authState.hasRole('admin');
  }

  protected formatDuration(session: ParkingSessionEntity): string {
    // Para sesiones activas, durationMinutes usa now() y refresca con el
    // clockTick cada minuto (consumido en el template).
    this.clockTick(); // dependencia reactiva para activas
    const minutes = session.status === 'cancelled' ? 0 : session.durationMinutes;
    if (minutes <= 0) return '—';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}min`;
  }

  /**
   * Cobro mostrado en la columna. Para sesiones completadas usa el
   * amount_due_cents persistido (lo que efectivamente se cobró). Para
   * activas, proyecta el cobro con la fórmula aditiva + tope plena usando
   * la tarifa snapshot y la duración actual.
   *
   * Importante: `amount_due_cents` tiene DEFAULT 0 en BD, así que activas
   * llegan con 0 (no null). El status es el discriminador correcto.
   */
  protected displayAmount(s: ParkingSessionEntity): string {
    this.clockTick();
    if (s.status === 'cancelled') return '—';
    if (s.isMonthly) return '$ 0';
    if (s.status === 'completed') {
      return this.formatCents(s.amountDueCents ?? 0);
    }
    // status === 'active': proyectar con el snapshot inmutable o, si no
    // existe (sesión legacy), con la tarifa por vehicle_type.
    const tById = s.tariffId ? this.tariffsById().get(s.tariffId) ?? null : null;
    const tByType = this.tariffsByType().get(s.vehicleType) ?? null;
    const perMin = s.tariffSnapshotPerMinuteCents ?? tById?.per_minute_cents ?? tByType?.per_minute_cents ?? null;
    const perHour = s.tariffSnapshotPerHourCents ?? tById?.per_hour_cents ?? tByType?.per_hour_cents ?? null;
    const plena = s.tariffSnapshotPlenaCents ?? tById?.plena_cents ?? tByType?.plena_cents ?? null;
    if (perMin == null || perHour == null || plena == null) return '—';
    const tariff = { per_minute_cents: perMin, per_hour_cents: perHour, plena_cents: plena };
    const dur = s.durationMinutes;
    if (dur <= 0) return this.formatCents(0);
    const hours = Math.floor(dur / 60);
    const rest = dur % 60;
    const subtotal = hours * tariff.per_hour_cents + rest * tariff.per_minute_cents;
    const amount = Math.min(subtotal, tariff.plena_cents);
    return this.formatCents(amount);
  }

  /** Indica al template si el monto de la fila es proyección (activa). */
  protected isProjected(s: ParkingSessionEntity): boolean {
    return s.status === 'active' && !s.isMonthly;
  }

  private formatCents(cents: number): string {
    return '$ ' + Math.round(cents / 100).toLocaleString('es-CO');
  }

  protected onApplyFilters(): void {
    this.currentPage = 1;
    this.load();
  }

  protected onPage(delta: number): void {
    const next = this.currentPage + delta;
    const total = this.pagination()?.totalPages ?? 1;
    if (next < 1 || next > total) return;
    this.currentPage = next;
    this.load();
  }

  protected confirmCancel(session: ParkingSessionEntity): void {
    const ref = this.dialog.open<{ reason: string } | undefined>(
      CancelSessionDialogComponent,
      {
        injector: this.envInjector,
        viewContainerRef: this.vcr,
        data: { plate: session.vehiclePlate },
      },
    );
    ref.closed.subscribe(async (result) => {
      if (!result) return;
      const userId = this.authState.currentUser()?.id;
      if (!userId) {
        this.toast.error('Sesión expirada. Inicia sesión nuevamente.');
        return;
      }
      const r = await this.cancelUC.execute({
        sessionId: session.id,
        reason: result.reason,
        userId,
      });
      r.fold(
        (f) => this.toast.error(`No se pudo anular: ${f.message}`),
        () => {
          this.toast.success(`Sesión ${session.vehiclePlate} anulada`);
          void this.load();
        },
      );
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const v = this.filterForm.value as {
      dateFrom: string;
      dateTo: string;
      plate: string;
      vehicleType: string;
      status: 'all' | 'active' | 'completed' | 'cancelled';
    };

    const result = await this.listSessionsUC.execute({
      dateFrom: v.dateFrom ? new Date(v.dateFrom + 'T00:00:00-05:00') : null,
      dateTo: v.dateTo ? new Date(v.dateTo + 'T23:59:59-05:00') : null,
      plate: v.plate || null,
      vehicleType: (v.vehicleType as VehicleType) || null,
      status: v.status,
      page: this.currentPage,
      pageSize: 50,
    });

    this.loading.set(false);
    result.fold(
      (f) => this.toast.error(`Error al cargar historial: ${f.message}`),
      (r) => {
        this.sessions.set(r.data);
        this.pagination.set(r.pagination);
      },
    );
  }
}
