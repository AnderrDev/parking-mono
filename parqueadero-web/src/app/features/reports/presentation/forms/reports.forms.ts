import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Injectable({ providedIn: 'root' })
export class ReportsForms {
  constructor(private readonly fb: FormBuilder) {}

  createReportFilterForm(defaults: { dateFrom: string; dateTo: string; groupBy?: string }): FormGroup {
    return this.fb.group({
      dateFrom: [defaults.dateFrom, Validators.required],
      dateTo: [defaults.dateTo, Validators.required],
      groupBy: [defaults.groupBy ?? 'day'],
    });
  }
}
