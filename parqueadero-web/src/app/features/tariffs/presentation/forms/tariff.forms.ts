import { Injectable } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { multipleOfCentsValidator } from '../../../../shared/forms/validators/multiple-of-cents.validator';

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
    perMinuteCents: number | null;
    perHourCents: number | null;
    plenaCents: number | null;
    validFrom: string;
    validTo: string;
    isActive: boolean;
  }>): FormGroup {
    const group = this.fb.group({
      name: [defaults?.name ?? '', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      vehicleType: [defaults?.vehicleType ?? 'carro', Validators.required],
      unit: [defaults?.unit ?? 'hora', Validators.required],
      // Legacy: solo se usa para mensualidad (precio mensual). Para parking
      // se deriva de perHourCents en el submit del dialog.
      valueCents: [defaults?.valueCents ?? null, [Validators.min(1), multipleOfCentsValidator()]],
      graceMinutes: [defaults?.graceMinutes ?? 0, [Validators.required, Validators.min(0)]],
      dailyCapCents: [defaults?.dailyCapCents ?? null, [Validators.min(1), multipleOfCentsValidator()]],
      // Tiered pricing (S4). Required cuando unit != 'mensualidad'.
      // NO se exige múltiplo de $50: la calc tiered no redondea (cobra el
      // monto exacto), así que el admin puede setear $60/min libremente.
      perMinuteCents: [defaults?.perMinuteCents ?? null, [Validators.min(1)]],
      perHourCents:   [defaults?.perHourCents   ?? null, [Validators.min(1)]],
      plenaCents:     [defaults?.plenaCents     ?? null, [Validators.min(1)]],
      validFrom: [defaults?.validFrom ?? null],
      validTo: [defaults?.validTo ?? null],
      isActive: [defaults?.isActive ?? true],
    });

    group.addValidators(tieredPricingCrossFieldValidator);
    return group;
  }
}

/**
 * Cross-field: para parking (unit != 'mensualidad'), la hora no puede ser más
 * cara que 60 min sueltos (C5), y la plena no puede superar 24 h (C6). Se
 * expone como errors `c5` / `c6` en el FormGroup para que el HTML los muestre.
 */
function tieredPricingCrossFieldValidator(group: AbstractControl): ValidationErrors | null {
  const unit = group.get('unit')?.value as string | null;
  if (unit === 'mensualidad') return null;

  const perMinute = num(group.get('perMinuteCents')?.value);
  const perHour   = num(group.get('perHourCents')?.value);
  const plena     = num(group.get('plenaCents')?.value);

  const errors: ValidationErrors = {};
  if (perMinute != null && perHour != null && perHour > perMinute * 60) {
    errors['c5'] = 'La hora no puede ser más cara que 60 min sueltos';
  }
  if (perHour != null && plena != null && plena > perHour * 24) {
    errors['c6'] = 'La plena no puede superar 24 h de la tarifa hora';
  }
  return Object.keys(errors).length ? errors : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
