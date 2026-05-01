import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';

@Injectable({ providedIn: 'root' })
export class AuditForms {
  constructor(private readonly fb: FormBuilder) {}

  createAuditFilterForm(defaults: { dateFrom: string; dateTo: string }): FormGroup {
    return this.fb.group({
      dateFrom: [defaults.dateFrom],
      dateTo: [defaults.dateTo],
      action: [''],
      entityType: [''],
    });
  }
}
