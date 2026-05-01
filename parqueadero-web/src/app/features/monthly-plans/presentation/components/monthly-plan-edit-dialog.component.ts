import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { MonthlyPlanForms } from '../forms/monthly-plan.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';
import { CurrencyCopPipe } from '../../../../shared/pipes/currency-cop.pipe';

export interface MonthlyPlanDialogData {
  plan: MonthlyPlanEntity | null;
}

export interface MonthlyPlanFormValue {
  vehiclePlate: string;
  customerId: string;
  planType: string;
  startDate: string;
  endDate: string;
  amountCents: number;
  autoRenew: boolean;
  paymentTokenId: string | null;
}

const PLAN_TYPES = [
  { value: 'basico', label: 'Básico' },
  { value: 'premium', label: 'Premium' },
  { value: 'ilimitado', label: 'Ilimitado' },
];

@Component({
  selector: 'app-monthly-plan-edit-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CurrencyCopPipe],
  templateUrl: './monthly-plan-edit-dialog.component.html',
  styleUrl: './monthly-plan-edit-dialog.component.scss',
})
export class MonthlyPlanEditDialogComponent implements OnInit {
  protected readonly data = inject<MonthlyPlanDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<MonthlyPlanFormValue | null>);
  private readonly planForms = inject(MonthlyPlanForms);

  protected form!: FormGroup;
  protected readonly planTypes = PLAN_TYPES;
  protected get isEdit(): boolean { return this.data.plan !== null; }

  ngOnInit(): void {
    const p = this.data.plan;
    this.form = this.planForms.createPlanForm(p ? {
      vehiclePlate: p.vehiclePlate,
      customerId: p.customerId,
      planType: p.planType,
      startDate: p.startDate.toISOString().slice(0, 10),
      endDate: p.endDate.toISOString().slice(0, 10),
      amountCents: p.amountCents,
      autoRenew: p.autoRenew,
      paymentTokenId: p.paymentTokenId,
    } : undefined);

    if (this.isEdit) {
      ['vehiclePlate', 'customerId', 'planType', 'startDate'].forEach(f => this.form.get(f)?.disable());
    }
  }

  protected err(field: string): boolean {
    const c = this.form.get(field);
    return !!c && c.invalid && c.touched;
  }

  protected errMsg(field: string): string {
    return getErrorMessage(this.form.get(field)?.errors ?? null);
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.dialogRef.close(this.form.getRawValue() as MonthlyPlanFormValue);
  }

  protected cancel(): void { this.dialogRef.close(null); }
}
