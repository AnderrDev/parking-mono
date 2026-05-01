import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import { VehicleForms } from '../forms/vehicle.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';

export interface VehicleDialogData {
  vehicle: VehicleEntity | null;
}

export interface VehicleFormValue {
  plate: string;
  vehicleType: string;
  color: string | null;
  brand: string | null;
  ownerCustomerId: string | null;
}

const VEHICLE_TYPES = [
  { value: 'carro', label: 'Carro' },
  { value: 'moto', label: 'Moto' },
  { value: 'bicicleta', label: 'Bicicleta' },
  { value: 'otro', label: 'Otro' },
];

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

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.dialogRef.close(this.form.getRawValue() as VehicleFormValue);
  }

  protected cancel(): void { this.dialogRef.close(null); }
}
