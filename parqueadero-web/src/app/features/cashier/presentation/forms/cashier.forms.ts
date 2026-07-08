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
      // Opcional: total digital verificado en cuentas/apps al cierre.
      digitalVerifiedCents: [null, [Validators.min(0)]],
      justification: [''],
    });
  }

  createWithdrawalForm(): FormGroup {
    return this.fb.group({
      movementType: ['out', [Validators.required]],
      amountCents: [null, [Validators.required, Validators.min(100)]],
      recipient: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
      justification: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]],
    });
  }

  createShiftHistoryFilterForm(defaults: { dateFrom: string; dateTo: string; onlyWithDiff: boolean }): FormGroup {
    return this.fb.group({
      dateFrom: [defaults.dateFrom],
      dateTo: [defaults.dateTo],
      // '' = todos los operadores.
      operatorId: [''],
      onlyWithDiff: [defaults.onlyWithDiff],
    });
  }
}
