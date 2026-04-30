import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Injectable({ providedIn: 'root' })
export class CashierForms {
  constructor(private readonly fb: FormBuilder) {}

  createOpenShiftForm(): FormGroup {
    return this.fb.group({
      openingBalanceCents: [0, [Validators.required, Validators.min(0)]],
    });
  }

  createCloseShiftForm(): FormGroup {
    return this.fb.group({
      closingBalanceCents: [null, [Validators.required, Validators.min(0)]],
      justification: [''],
    });
  }
}
