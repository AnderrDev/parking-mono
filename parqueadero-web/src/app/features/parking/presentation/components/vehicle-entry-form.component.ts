import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  OnInit,
} from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';
import { ParkingForms } from '../forms/parking.forms';
import { VehicleType } from '../../domain/entities/parking-session.entity';

export interface VehicleEntryFormValue {
  plate: string;
  vehicleType: VehicleType;
  color: string | null;
  brand: string | null;
}

interface VehicleTypeOption {
  value: VehicleType;
  label: string;
  icon: string; // SVG path data
}

@Component({
  selector: 'app-vehicle-entry-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, LoadingSpinnerComponent],
  templateUrl: './vehicle-entry-form.component.html',
  styleUrl: './vehicle-entry-form.component.scss',
})
export class VehicleEntryFormComponent implements OnInit {
  loading = input(false);
  disabled = input(false);
  monthlyPlanWarning = input<string | null>(null);
  submitted = output<VehicleEntryFormValue>();

  form!: FormGroup;

  protected readonly vehicleTypeOptions: VehicleTypeOption[] = [
    {
      value: 'carro',
      label: 'Carro',
      icon: 'M19 17h2v-3a4 4 0 0 0-2-3.45L17.5 7A4 4 0 0 0 14 5h-4a4 4 0 0 0-3.5 2L5 10.55A4 4 0 0 0 3 14v3h2 M9 17h6 M7 17a2 2 0 1 0 0 .1Z M17 17a2 2 0 1 0 0 .1Z',
    },
    {
      value: 'moto',
      label: 'Moto',
      icon: 'M5 17a3 3 0 1 0 0 .1Z M19 17a3 3 0 1 0 0 .1Z M14 6h4l2 6 M9 17h6 M5 17l4-7 3 7 M9 10h7',
    },
    {
      value: 'bicicleta',
      label: 'Bici',
      icon: 'M5 17.5a3.5 3.5 0 1 0 0 .1Z M19 17.5a3.5 3.5 0 1 0 0 .1Z M12 17.5h2l-2-7H8 M14 6h3l1 4',
    },
    {
      value: 'otro',
      label: 'Otro',
      icon: 'M12 8v4 M12 16h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
    },
  ];

  constructor(private readonly parkingForms: ParkingForms) {
    effect(() => {
      if (!this.form) return;
      if (this.disabled()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
  }

  ngOnInit(): void {
    this.form = this.parkingForms.createEntryForm();
    if (this.disabled()) this.form.disable({ emitEvent: false });
  }

  onSubmit(): void {
    if (this.disabled()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const raw = this.form.value as { plate: string; vehicleType: string; color: string; brand: string };
    this.submitted.emit({
      plate: raw.plate,
      vehicleType: raw.vehicleType as VehicleType,
      color: raw.color || null,
      brand: raw.brand || null,
    });
  }

  showError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }

  getFieldError(field: string): string {
    return getErrorMessage(this.form.get(field)?.errors ?? null);
  }

  resetForm(): void {
    this.form.reset({ vehicleType: 'carro' });
  }
}
