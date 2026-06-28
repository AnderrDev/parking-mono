import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { multipleOfCentsValidator } from '../../../../shared/forms/validators/multiple-of-cents.validator';
import { plateValidator } from '../../../../shared/forms/validators/plate.validator';
import { todayIsoBogota, isoBogotaPlusDays } from '../../../../shared/utils/date.utils';

@Injectable({ providedIn: 'root' })
export class MonthlyPlanForms {
  constructor(private readonly fb: FormBuilder) {}

  createPlanForm(defaults?: Partial<{
    vehiclePlate: string;
    customerId: string;
    planType: string;
    vehicleType: string;
    startDate: string;
    endDate: string;
    amountCents: number;
    autoRenew: boolean;
    paymentTokenId: string | null;
    paymentMethod: string;
  }>): FormGroup {
    return this.fb.group({
      vehiclePlate: [defaults?.vehiclePlate ?? '', [Validators.required, plateValidator()]],
      customerId: [defaults?.customerId ?? ''],
      planType: [defaults?.planType ?? 'basico', Validators.required],
      // Tipo de vehículo: dispara la tarifa de mensualidad en el dialog.
      vehicleType: [defaults?.vehicleType ?? 'carro', Validators.required],
      // Default: hoy (zona Bogotá) y hoy + 30 días para un plan estándar de
      // un mes. Si el usuario quiere otra cosa, edita los campos.
      startDate: [defaults?.startDate ?? todayIsoBogota(), Validators.required],
      endDate: [defaults?.endDate ?? isoBogotaPlusDays(30), Validators.required],
      amountCents: [defaults?.amountCents ?? null, [Validators.required, Validators.min(1), multipleOfCentsValidator()]],
      autoRenew: [defaults?.autoRenew ?? false],
      paymentTokenId: [defaults?.paymentTokenId ?? null],
      // Método con que el cliente pagó la mensualidad. Default efectivo
      // por ser lo más común. Solo aplica al crear (no se edita).
      paymentMethod: [defaults?.paymentMethod ?? 'efectivo', Validators.required],
    });
  }
}
