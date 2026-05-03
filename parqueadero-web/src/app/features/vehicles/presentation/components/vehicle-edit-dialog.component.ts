import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import { VehicleForms } from '../forms/vehicle.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';
import { VEHICLE_TYPES } from '../../../../shared/constants/form-options';

export interface VehicleDialogData {
  vehicle: VehicleEntity | null;
  /** Si se provee, el dialog se mantiene abierto en error y muestra
   * el mensaje inline. Ver `feedback_dialog_inline_errors.md`. */
  onSubmit?: (value: VehicleFormValue) => Promise<string | null>;
}

export interface VehicleFormValue {
  plate: string;
  vehicleType: string;
  color: string | null;
  brand: string | null;
  ownerCustomerId: string | null;
}


@Component({
  selector: 'app-vehicle-edit-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './vehicle-edit-dialog.component.html',
  styleUrl: './vehicle-edit-dialog.component.scss',
})
export class VehicleEditDialogComponent implements OnInit {
  protected readonly data = inject<VehicleDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<VehicleFormValue | null>);
  private readonly vehicleForms = inject(VehicleForms);

  protected form!: FormGroup;
  protected readonly vehicleTypes = VEHICLE_TYPES;
  protected get isEdit(): boolean { return this.data.vehicle !== null; }
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  ngOnInit(): void {
    const v = this.data.vehicle;
    this.form = this.vehicleForms.createVehicleForm(v ? {
      plate: v.plate,
      vehicleType: v.vehicleType,
      color: v.color,
      brand: v.brand,
      ownerCustomerId: v.ownerCustomerId,
    } : undefined);

    if (this.isEdit) {
      this.form.get('plate')?.disable();
      this.form.get('vehicleType')?.disable();
    }
  }

  protected err(field: string): boolean {
    const c = this.form.get(field);
    return !!c && c.invalid && c.touched;
  }

  protected errMsg(field: string): string {
    return getErrorMessage(this.form.get(field)?.errors ?? null);
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue() as VehicleFormValue;

    if (this.data.onSubmit) {
      this.submitting.set(true);
      this.submitError.set(null);
      const errorMsg = await this.data.onSubmit(value);
      this.submitting.set(false);
      if (errorMsg) {
        this.submitError.set(errorMsg);
        return;
      }
      this.dialogRef.close(value);
      return;
    }
    this.dialogRef.close(value);
  }

  protected cancel(): void { this.dialogRef.close(null); }
}
