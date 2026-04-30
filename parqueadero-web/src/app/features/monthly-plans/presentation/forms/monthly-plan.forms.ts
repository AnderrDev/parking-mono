import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Injectable({ providedIn: 'root' })
export class MonthlyPlanForms {
  constructor(private readonly fb: FormBuilder) {}

  createPlanForm(defaults?: Partial<{
    vehiclePlate: string;
    customerId: string;
    planType: string;
    startDate: string;
    endDate: string;
    amountCents: number;
    autoRenew: boolean;
    paymentTokenId: string | null;
  }>): FormGroup {
    return this.fb.group({
      vehiclePlate: [defaults?.vehiclePlate ?? '', [Validators.required, Validators.pattern(/^[A-Z0-9]{5,7}$/)]],
      customerId: [defaults?.customerId ?? '', Validators.required],
      planType: [defaults?.planType ?? 'basico', Validators.required],
      startDate: [defaults?.startDate ?? '', Validators.required],
      endDate: [defaults?.endDate ?? '', Validators.required],
      amountCents: [defaults?.amountCents ?? null, [Validators.required, Validators.min(1)]],
      autoRenew: [defaults?.autoRenew ?? false],
      paymentTokenId: [defaults?.paymentTokenId ?? null],
    });
  }
}
