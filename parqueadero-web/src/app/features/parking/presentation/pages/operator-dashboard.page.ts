import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  signal,
} from '@angular/core';
import {
  BusinessRuleFailure,
  NetworkFailure,
  ServerFailure,
  ValidationFailure,
} from '../../../../core/either/failures';
import {
  REGISTER_VEHICLE_ENTRY_TOKEN,
  SEARCH_VEHICLE_BY_PLATE_TOKEN,
} from '../../../../core/di/injection-tokens';
import { AuthStateService } from '../../../../core/services/auth-state.service';
import { ErrorDisplayComponent } from '../../../../shared/components/error-display/error-display.component';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { ParkingSessionEntity } from '../../domain/entities/parking-session.entity';
import {
  RegisterVehicleEntryUseCase,
} from '../../domain/usecases/register-vehicle-entry.usecase';
import {
  SearchVehicleByPlateUseCase,
} from '../../domain/usecases/search-vehicle-by-plate.usecase';
import {
  VehicleEntryFormComponent,
  VehicleEntryFormValue,
} from '../components/vehicle-entry-form.component';

type ToastVariant = 'success' | 'warning' | 'error';

interface Toast {
  message: string;
  variant: ToastVariant;
}

@Component({
  selector: 'app-operator-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VehicleEntryFormComponent, ErrorDisplayComponent, LoadingSpinnerComponent],
  template: `
    <div class="dashboard">
      <header class="dashboard__header">
        <h1 class="dashboard__title">Dashboard Operario</h1>
        @if (authState.currentUser()) {
          <p class="dashboard__user">
            {{ authState.currentUser()!.nombre }}
          </p>
        }
      </header>

      <!-- Toast notification -->
      @if (toast()) {
        <div
          class="dashboard__toast"
          [class.dashboard__toast--success]="toast()!.variant === 'success'"
          [class.dashboard__toast--warning]="toast()!.variant === 'warning'"
          [class.dashboard__toast--error]="toast()!.variant === 'error'"
          role="status"
          aria-live="polite"
        >
          {{ toast()!.message }}
          <button class="dashboard__toast-close" type="button" (click)="dismissToast()" aria-label="Cerrar">
            ×
          </button>
        </div>
      }

      <div class="dashboard__layout">
        <!-- Entry form panel -->
        <section class="dashboard__panel" aria-labelledby="entry-heading">
          <h2 id="entry-heading" class="dashboard__panel-title">Registrar Entrada</h2>

          <app-vehicle-entry-form
            [loading]="entryLoading()"
            [monthlyPlanWarning]="monthlyPlanWarning()"
            (submitted)="onEntrySubmit($event)"
          />
        </section>

        <!-- Active sessions panel (placeholder for Fase 4.B) -->
        <section class="dashboard__panel" aria-labelledby="sessions-heading">
          <h2 id="sessions-heading" class="dashboard__panel-title">
            Sesiones Activas
            @if (activeSessions().length > 0) {
              <span class="dashboard__badge">{{ activeSessions().length }}</span>
            }
          </h2>

          @if (sessionsLoading()) {
            <div class="dashboard__loading-state">
              <app-loading-spinner label="Cargando sesiones activas..." />
            </div>
          } @else if (activeSessions().length === 0) {
            <p class="dashboard__empty">No hay vehículos en el parqueadero.</p>
          } @else {
            <ul class="sessions-list" role="list">
              @for (session of activeSessions(); track session.id) {
                <li class="sessions-list__item">
                  <span class="sessions-list__plate">{{ session.vehiclePlate }}</span>
                  <span class="sessions-list__type">{{ session.vehicleType }}</span>
                  <span class="sessions-list__duration">{{ session.durationMinutes }} min</span>
                  @if (session.isMonthly) {
                    <span class="sessions-list__monthly-badge">MENSUAL</span>
                  }
                </li>
              }
            </ul>
          }
        </section>
      </div>
    </div>
  `,
  styles: [`
    .dashboard {
      padding: var(--space-6);
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      max-width: 1200px;
      margin: 0 auto;
    }

    .dashboard__header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-4);
    }

    .dashboard__title {
      font-size: var(--text-2xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      margin: 0;
    }

    .dashboard__user {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin: 0;
    }

    .dashboard__toast {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      font-size: var(--text-sm);
      font-weight: var(--font-weight-medium);
      animation: slideDown var(--motion-duration-normal) var(--motion-easing-standard);

      &--success {
        background: color-mix(in srgb, var(--color-success) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--color-success) 40%, transparent);
        color: var(--color-success);
      }
      &--warning {
        background: color-mix(in srgb, var(--color-warning) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--color-warning) 40%, transparent);
        color: var(--color-warning-dark, #b45309);
      }
      &--error {
        background: color-mix(in srgb, var(--color-danger) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--color-danger) 40%, transparent);
        color: var(--color-danger);
      }
    }

    .dashboard__toast-close {
      font-size: var(--text-lg);
      line-height: 1;
      padding: 0 var(--space-1);
      cursor: pointer;
      color: inherit;
      opacity: 0.7;
      &:hover { opacity: 1; }
    }

    .dashboard__layout {
      display: grid;
      grid-template-columns: 400px 1fr;
      gap: var(--space-6);
      align-items: start;

      @media (max-width: 768px) {
        grid-template-columns: 1fr;
      }
    }

    .dashboard__panel {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl);
      padding: var(--space-6);
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .dashboard__panel-title {
      font-size: var(--text-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      margin: 0;
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .dashboard__badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--color-primary);
      color: #fff;
      font-size: var(--text-xs);
      font-weight: var(--font-weight-bold);
      border-radius: 9999px;
      min-width: 20px;
      height: 20px;
      padding: 0 var(--space-1);
    }

    .dashboard__loading-state {
      display: flex;
      justify-content: center;
      padding: var(--space-8);
    }

    .dashboard__empty {
      color: var(--color-text-secondary);
      font-size: var(--text-sm);
      text-align: center;
      padding: var(--space-8) 0;
      margin: 0;
    }

    .sessions-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .sessions-list__item {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--color-bg-subtle);
      border-radius: var(--radius-md);
      font-size: var(--text-sm);
    }

    .sessions-list__plate {
      font-family: var(--font-mono);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.05em;
      color: var(--color-text-primary);
      flex: 1;
    }

    .sessions-list__type {
      color: var(--color-text-secondary);
      text-transform: capitalize;
    }

    .sessions-list__duration {
      color: var(--color-text-secondary);
      font-variant-numeric: tabular-nums;
    }

    .sessions-list__monthly-badge {
      background: color-mix(in srgb, var(--color-monthly, #7c3aed) 15%, transparent);
      color: var(--color-monthly, #7c3aed);
      font-size: var(--text-xs);
      font-weight: var(--font-weight-bold);
      padding: 2px var(--space-2);
      border-radius: var(--radius-sm);
    }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class OperatorDashboardPageComponent {
  readonly entryLoading = signal(false);
  readonly sessionsLoading = signal(false);
  readonly activeSessions = signal<ParkingSessionEntity[]>([]);
  readonly monthlyPlanWarning = signal<string | null>(null);
  readonly toast = signal<Toast | null>(null);

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    @Inject(REGISTER_VEHICLE_ENTRY_TOKEN)
    private readonly registerEntry: RegisterVehicleEntryUseCase,
    @Inject(SEARCH_VEHICLE_BY_PLATE_TOKEN)
    private readonly searchByPlate: SearchVehicleByPlateUseCase,
    readonly authState: AuthStateService,
  ) {}

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
          this.showToast(failure.message, 'error');
        } else if (failure instanceof NetworkFailure) {
          this.showToast('Sin conexión. La entrada se guardará cuando haya red.', 'warning');
        } else if (failure instanceof ServerFailure) {
          this.showToast(`Error al registrar entrada: ${failure.message}`, 'error');
        } else {
          this.showToast('Error inesperado. Intenta de nuevo.', 'error');
        }
      },
      ({ session, monthlyPlanWarning }) => {
        this.activeSessions.update((prev) => [session, ...prev]);
        this.showToast(
          `Vehículo ${session.vehiclePlate} registrado a las ${session.entryAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`,
          'success',
        );
        if (monthlyPlanWarning) {
          this.monthlyPlanWarning.set(monthlyPlanWarning);
        }
      },
    );
  }

  dismissToast(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set(null);
  }

  private showToast(message: string, variant: ToastVariant): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ message, variant });
    this.toastTimer = setTimeout(() => this.toast.set(null), 5000);
  }
}
