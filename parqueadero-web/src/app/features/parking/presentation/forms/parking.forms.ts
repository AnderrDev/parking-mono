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
      emitInvoice: [false],
      // HU-029: monto recibido en efectivo. Validators dinámicos en el dialog
      // según método de pago (efectivo + monto > 0).
      cashReceivedCents: [null as number | null],
      // HU-040: customer seleccionado para factura electrónica.
      customerId: [null as string | null],
    });
  }

  createCancelSessionForm(): FormGroup {
    return this.fb.group({
      reason: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    });
  }

  createSessionHistoryFilterForm(defaults: {
    dateFrom: string;
    dateTo: string;
    plate?: string;
    vehicleType?: string;
    status?: string;
  }): FormGroup {
    return this.fb.group({
      dateFrom: [defaults.dateFrom],
      dateTo: [defaults.dateTo],
      plate: [defaults.plate ?? ''],
      vehicleType: [defaults.vehicleType ?? ''],
      status: [defaults.status ?? 'all'],
    });
  }
}
