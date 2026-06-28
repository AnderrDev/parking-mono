import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { colombianPhoneValidator } from '../../../../shared/forms/validators/colombian-phone.validator';

export const PAYMENT_METHODS = [
  'efectivo', 'tarjeta_credito', 'tarjeta_debito', 'transferencia', 'nequi', 'daviplata',
];

@Injectable({ providedIn: 'root' })
export class SettingsForms {
  constructor(private readonly fb: FormBuilder) {}

  createParkingInfoForm(): FormGroup {
    return this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(200)]],
      nit: ['', Validators.maxLength(20)],
      dv: ['', [Validators.maxLength(2)]],
      address: ['', Validators.maxLength(200)],
      municipio: ['', Validators.maxLength(100)],
      departamento: ['', Validators.maxLength(100)],
      phone: ['', colombianPhoneValidator()],
      email: ['', Validators.email],
      parkingType: ['', Validators.maxLength(20)],
      resolutionNumber: ['', Validators.maxLength(40)],
      closingTime: ['', Validators.maxLength(10)],
      printerName: [''],
      printEntryTicketEnabled: [true],
      printExitReceiptEnabled: [true],
      openDrawerOnCashPayment: [false],
    });
  }

  createOperationalConfigForm(): FormGroup {
    return this.fb.group({
      cash_cap_cents: [50_000_000, [Validators.required, Validators.min(0)]],
      monthly_grace_days: [3, [Validators.required, Validators.min(0), Validators.max(30)]],
      max_courtesies_per_shift: [3, [Validators.required, Validators.min(0)]],
      admin_email: ['', Validators.email],
      enabled_payment_methods: [PAYMENT_METHODS],
    });
  }
}
