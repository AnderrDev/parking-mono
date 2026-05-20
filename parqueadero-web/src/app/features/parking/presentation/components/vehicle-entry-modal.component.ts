// VehicleEntryModalComponent — wrapper modal del form de ingreso.
// Spec: parqueadero-web/specs/components/vehicle-entry-modal.spec.md
//
// Orquesta:
//  • RegisterVehicleEntryUseCase (crear sesión)
//  • SearchVehicleByPlateUseCase (autocomplete por placa)
//  • PrintEntryTicketUseCase (auto-imprimir ticket térmico al confirmar)
//
// Errores backend se muestran inline (banner rojo arriba del form), NO cierran
// el modal — patrón "no perder datos" (memoria feedback_dialog_inline_errors).

import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import {
  REGISTER_VEHICLE_ENTRY_TOKEN,
} from '../../../../core/di/injection-tokens';
import {
  BusinessRuleFailure,
  NetworkFailure,
  ServerFailure,
  ValidationFailure,
} from '../../../../core/either/failures';
import { AuthStateService } from '../../../../core/services/auth-state.service';
import {
  RegisterVehicleEntryUseCase,
} from '../../domain/usecases/register-vehicle-entry.usecase';
import {
  PrintEntryTicketUseCase,
} from '../../domain/usecases/print-entry-ticket.usecase';
import { ParkingSessionEntity, VehicleType } from '../../domain/entities/parking-session.entity';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import {
  VehicleEntryFormComponent,
  VehicleEntryFormValue,
} from './vehicle-entry-form.component';

export interface VehicleEntryModalData {
  availableTypes: VehicleType[] | null;
  tariffByType: Map<VehicleType, TariffEntity>;
  // Si true, el banner de "sin tarifa" muestra el link a crear (admin).
  isAdmin: boolean;
}

export interface VehicleEntryModalResult {
  session: ParkingSessionEntity;
  monthlyPlanWarning: string | null;
  ticketPrinted: boolean;
}

@Component({
  selector: 'app-vehicle-entry-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VehicleEntryFormComponent],
  templateUrl: './vehicle-entry-modal.component.html',
  styleUrl: './vehicle-entry-modal.component.scss',
})
export class VehicleEntryModalComponent {
  protected readonly submitting = signal(false);
  protected readonly errorBanner = signal<string | null>(null);
  protected readonly entryForm = viewChild.required<VehicleEntryFormComponent>('entryForm');

  private readonly authState = inject(AuthStateService);
  private readonly printTicket = inject(PrintEntryTicketUseCase);
  private readonly router = inject(Router);

  constructor(
    @Inject(DIALOG_DATA) public readonly data: VehicleEntryModalData,
    public readonly dialogRef: DialogRef<VehicleEntryModalResult>,
    @Inject(REGISTER_VEHICLE_ENTRY_TOKEN)
    private readonly registerEntry: RegisterVehicleEntryUseCase,
  ) {}

  protected onConfirmClick(): void {
    // Delega al form interno; si es válido, emite (submitted).
    this.entryForm().onSubmit();
  }

  protected async onSubmit(value: VehicleEntryFormValue): Promise<void> {
    const user = this.authState.currentUser();
    if (!user) {
      this.errorBanner.set('Sesión expirada. Vuelve a iniciar sesión.');
      return;
    }
    this.submitting.set(true);
    this.errorBanner.set(null);

    const result = await this.registerEntry.execute({
      plate: value.plate,
      vehicleType: value.vehicleType,
      color: value.color,
      brand: value.brand,
      userId: user.id,
    });

    this.submitting.set(false);

    result.fold(
      (failure) => {
        if (failure instanceof ValidationFailure || failure instanceof BusinessRuleFailure) {
          this.errorBanner.set(failure.message);
        } else if (failure instanceof NetworkFailure) {
          this.errorBanner.set('Sin conexión — la entrada se guardará al recuperar red.');
        } else if (failure instanceof ServerFailure) {
          this.errorBanner.set(`Error al registrar: ${failure.message}`);
        } else {
          this.errorBanner.set('Error inesperado. Intenta de nuevo.');
        }
      },
      async ({ session, monthlyPlanWarning }) => {
        // Auto-print ticket térmico — no bloquea ni rompe si falla.
        const tariff = this.data.tariffByType.get(session.vehicleType) ?? null;
        const printResult = await this.printTicket.execute({
          session,
          tariffSnapshot: tariff,
        });
        const ticketPrinted = printResult.isRight();

        this.dialogRef.close({
          session,
          monthlyPlanWarning: monthlyPlanWarning ?? null,
          ticketPrinted,
        });
      },
    );
  }

  protected onCancel(): void {
    if (this.hasUnsavedData()) {
      const ok = window.confirm('¿Descartar lo escrito? La entrada no se ha registrado.');
      if (!ok) return;
    }
    this.dialogRef.close(undefined);
  }

  /**
   * Cierra el modal y navega al admin de tarifas con prefill del tipo
   * solicitado. Si no hay tipo (banner global sin ninguna tarifa), navega
   * sin prefill y el admin abre el dialog de creación desde cero.
   */
  protected onCreateTariffRequested(vehicleType: VehicleType | null): void {
    this.dialogRef.close(undefined);
    const queryParams = vehicleType ? { prefill: vehicleType } : {};
    this.router.navigate(['/tariffs'], { queryParams });
  }

  private hasUnsavedData(): boolean {
    const form = this.entryForm()?.form;
    if (!form) return false;
    const v = form.value as { plate?: string; color?: string; brand?: string };
    return Boolean(v.plate?.trim() || v.color?.trim() || v.brand?.trim());
  }
}
