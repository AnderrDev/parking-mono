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
import { CurrencyCopPipe } from '../../../../shared/pipes/currency-cop.pipe';
import { CancelSessionDialogComponent } from '../components/cancel-session-dialog.component';

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

  filterForm!: FormGroup;
  protected currentPage = 1;

  private readonly parkingForms = inject(ParkingForms);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly authState = inject(AuthStateService);
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
    this.load();
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
    if (!session.exitAt) return '—';
    const minutes = Math.ceil(
      (session.exitAt.getTime() - session.entryAt.getTime()) / 60_000,
    );
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}min`;
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
