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
    duration: string;
    startDate: string;
    endDate: string;
    amountCents: number;
    paymentMethod: string;
  }>): FormGroup {
    return this.fb.group({
      vehiclePlate: [defaults?.vehiclePlate ?? '', [Validators.required, plateValidator()]],
      customerId: [defaults?.customerId ?? ''],
      planType: [defaults?.planType ?? 'basico', Validators.required],
      // Tipo de vehículo: junto con la duración dispara el lookup de tarifa.
      vehicleType: [defaults?.vehicleType ?? 'carro', Validators.required],
      // Duración del plan: 'quincena' (15 días) o 'mensualidad' (30). Define
      // la fecha de vencimiento y qué tarifa se consulta. No se persiste:
      // en BD la duración son `start_date` y `end_date`.
      duration: [defaults?.duration ?? 'mensualidad', Validators.required],
      // Default: hoy (zona Bogotá) y hoy + 30 días, que es la duración por
      // defecto. Al cambiar duración o inicio, el diálogo recalcula el fin.
      startDate: [defaults?.startDate ?? todayIsoBogota(), Validators.required],
      endDate: [defaults?.endDate ?? isoBogotaPlusDays(30), Validators.required],
      amountCents: [defaults?.amountCents ?? null, [Validators.required, Validators.min(1), multipleOfCentsValidator()]],
      // Método con que el cliente pagó la mensualidad. Default efectivo
      // por ser lo más común. Solo aplica al crear (no se edita).
      paymentMethod: [defaults?.paymentMethod ?? 'efectivo', Validators.required],
    });
  }
}
