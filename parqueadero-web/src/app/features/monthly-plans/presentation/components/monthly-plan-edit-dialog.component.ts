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
  template: `
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="plan-dialog-title">
      <header class="dialog__header">
        <h2 class="dialog__title" id="plan-dialog-title">
          {{ isEdit ? 'Editar plan mensual' : 'Nuevo plan mensual' }}
        </h2>
      </header>

      <form class="dialog__body" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (!isEdit) {
          <div class="field-row">
            <div class="field">
              <label class="field__label" for="p-plate">Placa</label>
              <input id="p-plate" class="field__input" [class.field__input--error]="err('vehiclePlate')"
                type="text" formControlName="vehiclePlate" placeholder="ABC123"
                style="text-transform: uppercase"
                [attr.aria-describedby]="err('vehiclePlate') ? 'p-plate-err' : null" />
              @if (err('vehiclePlate')) {
                <span id="p-plate-err" class="field__error" role="alert">{{ errMsg('vehiclePlate') }}</span>
              }
            </div>
            <div class="field">
              <label class="field__label" for="p-type">Tipo de plan</label>
              <select id="p-type" class="field__select" formControlName="planType">
                @for (pt of planTypes; track pt.value) {
                  <option [value]="pt.value">{{ pt.label }}</option>
                }
              </select>
            </div>
          </div>

          <div class="field">
            <label class="field__label" for="p-customer">ID de cliente (UUID)</label>
            <input id="p-customer" class="field__input" [class.field__input--error]="err('customerId')"
              type="text" formControlName="customerId" placeholder="uuid del cliente"
              [attr.aria-describedby]="err('customerId') ? 'p-customer-err' : null" />
            @if (err('customerId')) {
              <span id="p-customer-err" class="field__error" role="alert">{{ errMsg('customerId') }}</span>
            }
          </div>

          <div class="field-row">
            <div class="field">
              <label class="field__label" for="p-start">Fecha inicio</label>
              <input id="p-start" class="field__input" [class.field__input--error]="err('startDate')"
                type="date" formControlName="startDate"
                [attr.aria-describedby]="err('startDate') ? 'p-start-err' : null" />
              @if (err('startDate')) {
                <span id="p-start-err" class="field__error" role="alert">{{ errMsg('startDate') }}</span>
              }
            </div>
            <div class="field">
              <label class="field__label" for="p-end">Fecha fin</label>
              <input id="p-end" class="field__input" [class.field__input--error]="err('endDate')"
                type="date" formControlName="endDate"
                [attr.aria-describedby]="err('endDate') ? 'p-end-err' : null" />
              @if (err('endDate')) {
                <span id="p-end-err" class="field__error" role="alert">{{ errMsg('endDate') }}</span>
              }
            </div>
          </div>
        } @else {
          <div class="field-row">
            <div class="field">
              <label class="field__label" for="p-end">Fecha fin</label>
              <input id="p-end" class="field__input" [class.field__input--error]="err('endDate')"
                type="date" formControlName="endDate"
                [attr.aria-describedby]="err('endDate') ? 'p-end-err' : null" />
              @if (err('endDate')) {
                <span id="p-end-err" class="field__error" role="alert">{{ errMsg('endDate') }}</span>
              }
            </div>
            <div class="field">
              <label class="field__label" for="p-amount">Valor (COP)</label>
              <input id="p-amount" class="field__input" [class.field__input--error]="err('amountCents')"
                type="number" formControlName="amountCents" min="1"
                [attr.aria-describedby]="err('amountCents') ? 'p-amount-err' : null" />
              @if (err('amountCents')) {
                <span id="p-amount-err" class="field__error" role="alert">{{ errMsg('amountCents') }}</span>
              }
            </div>
          </div>
        }

        @if (!isEdit) {
          <div class="field">
            <label class="field__label" for="p-amount">Valor (COP)</label>
            <input id="p-amount" class="field__input" [class.field__input--error]="err('amountCents')"
              type="number" formControlName="amountCents" min="1" placeholder="150000000"
              [attr.aria-describedby]="err('amountCents') ? 'p-amount-err' : null" />
            @if (err('amountCents')) {
              <span id="p-amount-err" class="field__error" role="alert">{{ errMsg('amountCents') }}</span>
            }
          </div>
        }

        <label class="field-checkbox">
          <input type="checkbox" formControlName="autoRenew" />
          <span>Renovación automática</span>
        </label>

        @if (form.get('autoRenew')?.value) {
          <div class="field">
            <label class="field__label" for="p-token">Token de pago</label>
            <input id="p-token" class="field__input"
              type="text" formControlName="paymentTokenId" placeholder="tok_..." />
          </div>
        }

        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" (click)="cancel()">Cancelar</button>
          <button type="submit" class="btn btn--primary">
            {{ isEdit ? 'Guardar cambios' : 'Crear plan' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .dialog { background: var(--color-surface); border-radius: var(--radius-lg); padding: var(--space-6); width: min(560px, 95vw); box-shadow: var(--shadow-3); display: flex; flex-direction: column; gap: var(--space-5); }
    .dialog__header { border-bottom: 1px solid var(--color-border); padding-bottom: var(--space-4); }
    .dialog__title { font-size: var(--text-lg); font-weight: var(--font-weight-semibold); margin: 0; }
    .dialog__body { display: flex; flex-direction: column; gap: var(--space-4); }
    .dialog__actions { display: flex; gap: var(--space-3); justify-content: flex-end; padding-top: var(--space-2); border-top: 1px solid var(--color-border); }
    .field { display: flex; flex-direction: column; gap: var(--space-1); }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
    .field__label { font-size: var(--text-sm); font-weight: var(--font-weight-medium); color: var(--color-text); }
    .field__input, .field__select { padding: var(--space-2) var(--space-3); font-size: var(--text-base); font-family: var(--font-sans); color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); min-height: var(--touch-target-min); box-sizing: border-box; width: 100%; &:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent); } }
    .field__input--error { border-color: var(--color-danger); }
    .field__error { font-size: var(--text-xs); color: var(--color-danger); }
    .field-checkbox { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); cursor: pointer; }
    .btn { padding: var(--space-2) var(--space-5); border-radius: var(--radius-md); font-weight: var(--font-weight-semibold); font-size: var(--text-base); min-height: var(--touch-target-secondary); cursor: pointer; }
    .btn--ghost { background: var(--color-surface-2); color: var(--color-text); border: 1px solid var(--color-border); }
    .btn--primary { background: var(--color-primary); color: var(--color-primary-fg); }
    @media (max-width: 480px) { .field-row { grid-template-columns: 1fr; } }
  `],
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
