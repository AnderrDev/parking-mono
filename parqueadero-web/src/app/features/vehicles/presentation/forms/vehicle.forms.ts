import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Injectable({ providedIn: 'root' })
export class VehicleForms {
  constructor(private readonly fb: FormBuilder) {}

  createVehicleForm(defaults?: Partial<{
    plate: string;
    vehicleType: string;
    color: string | null;
    brand: string | null;
    ownerCustomerId: string | null;
  }>): FormGroup {
    return this.fb.group({
      plate: [defaults?.plate ?? '', [Validators.required, Validators.pattern(/^[A-Z0-9]{5,7}$/)]],
      vehicleType: [defaults?.vehicleType ?? 'carro', Validators.required],
      color: [defaults?.color ?? null, Validators.maxLength(50)],
      brand: [defaults?.brand ?? null, Validators.maxLength(50)],
      ownerCustomerId: [defaults?.ownerCustomerId ?? null],
    });
  }
}
