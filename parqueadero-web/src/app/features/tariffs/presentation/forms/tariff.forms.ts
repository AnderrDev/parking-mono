import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Injectable({ providedIn: 'root' })
export class TariffForms {
  constructor(private readonly fb: FormBuilder) {}

  createTariffForm(defaults?: Partial<{
    name: string;
    vehicleType: string;
    unit: string;
    valueCents: number;
    graceMinutes: number;
    dailyCapCents: number;
    validFrom: string;
    validTo: string;
    isActive: boolean;
  }>): FormGroup {
    return this.fb.group({
      name: [defaults?.name ?? '', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      vehicleType: [defaults?.vehicleType ?? 'carro', Validators.required],
      unit: [defaults?.unit ?? 'hora', Validators.required],
      valueCents: [defaults?.valueCents ?? null, [Validators.required, Validators.min(1)]],
      graceMinutes: [defaults?.graceMinutes ?? 0, [Validators.required, Validators.min(0)]],
      dailyCapCents: [defaults?.dailyCapCents ?? null, [Validators.required, Validators.min(1)]],
      validFrom: [defaults?.validFrom ?? null],
      validTo: [defaults?.validTo ?? null],
      isActive: [defaults?.isActive ?? true],
    });
  }
}
