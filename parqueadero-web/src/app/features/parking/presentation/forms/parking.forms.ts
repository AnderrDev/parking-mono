import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { plateValidator } from '../../../../shared/forms/validators/plate.validator';

@Injectable({ providedIn: 'root' })
export class ParkingForms {
  constructor(private readonly fb: FormBuilder) {}

  createEntryForm(): FormGroup {
    return this.fb.group({
      plate: ['', [Validators.required, plateValidator()]],
      vehicleType: ['carro', Validators.required],
      color: ['', Validators.maxLength(50)],
      brand: ['', Validators.maxLength(50)],
    });
  }

  createExitForm(): FormGroup {
    return this.fb.group({
      plate: [{ value: '', disabled: true }, Validators.required],
      vehicleType: [{ value: '', disabled: true }, Validators.required],
      paymentMethod: ['efectivo', Validators.required],
      justification: [''],
    });
  }
}
