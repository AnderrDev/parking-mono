import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { TariffForms } from '../forms/tariff.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';

export interface TariffDialogData {
  tariff: TariffEntity | null;
}

export interface TariffFormValue {
  name: string;
  vehicleType: string;
  unit: string;
  valueCents: number;
  graceMinutes: number;
  dailyCapCents: number;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
}

const VEHICLE_TYPES = [
  { value: 'carro', label: 'Carro' },
  { value: 'moto', label: 'Moto' },
  { value: 'bicicleta', label: 'Bicicleta' },
  { value: 'otro', label: 'Otro' },
];

const UNITS = [
  { value: 'hora', label: 'Por hora' },
  { value: 'fraccion', label: 'Por fracción (30 min)' },
  { value: 'minuto', label: 'Por minuto' },
  { value: 'dia', label: 'Por día' },
];

@Component({
  selector: 'app-tariff-edit-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="tariff-dialog-title">
      <header class="dialog__header">
        <h2 class="dialog__title" id="tariff-dialog-title">
          {{ isEdit ? 'Editar tarifa' : 'Nueva tarifa' }}
        </h2>
      </header>

      <form class="dialog__body" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label class="field__label" for="t-name">Nombre</label>
          <input id="t-name" class="field__input" [class.field__input--error]="err('name')"
            type="text" formControlName="name" placeholder="Ej: Tarifa carro estándar"
            [attr.aria-describedby]="err('name') ? 't-name-err' : null" />
          @if (err('name')) {
            <span id="t-name-err" class="field__error" role="alert">{{ errMsg('name') }}</span>
          }
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field__label" for="t-type">Tipo de vehículo</label>
            <select id="t-type" class="field__select" formControlName="vehicleType">
              @for (vt of vehicleTypes; track vt.value) {
                <option [value]="vt.value">{{ vt.label }}</option>
              }
            </select>
            @if (isEdit) {
              <span class="field__hint">El tipo de vehículo no se puede cambiar</span>
            }
          </div>

          <div class="field">
            <label class="field__label" for="t-unit">Unidad de cobro</label>
            <select id="t-unit" class="field__select" formControlName="unit">
              @for (u of units; track u.value) {
                <option [value]="u.value">{{ u.label }}</option>
              }
            </select>
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field__label" for="t-value">Valor (COP)</label>
            <input id="t-value" class="field__input" [class.field__input--error]="err('valueCents')"
              type="number" formControlName="valueCents" min="1" placeholder="500000"
              [attr.aria-describedby]="err('valueCents') ? 't-value-err' : null" />
            @if (err('valueCents')) {
              <span id="t-value-err" class="field__error" role="alert">{{ errMsg('valueCents') }}</span>
            }
          </div>

          <div class="field">
            <label class="field__label" for="t-cap">Tope diario (COP)</label>
            <input id="t-cap" class="field__input" [class.field__input--error]="err('dailyCapCents')"
              type="number" formControlName="dailyCapCents" min="1" placeholder="30000000"
              [attr.aria-describedby]="err('dailyCapCents') ? 't-cap-err' : null" />
            @if (err('dailyCapCents')) {
              <span id="t-cap-err" class="field__error" role="alert">{{ errMsg('dailyCapCents') }}</span>
            }
          </div>
        </div>

        <div class="field" style="max-width: 160px">
          <label class="field__label" for="t-grace">Minutos de gracia</label>
          <input id="t-grace" class="field__input" [class.field__input--error]="err('graceMinutes')"
            type="number" formControlName="graceMinutes" min="0" placeholder="0"
            [attr.aria-describedby]="err('graceMinutes') ? 't-grace-err' : null" />
          @if (err('graceMinutes')) {
            <span id="t-grace-err" class="field__error" role="alert">{{ errMsg('graceMinutes') }}</span>
          }
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field__label" for="t-from">Válida desde</label>
            <input id="t-from" class="field__input" type="date" formControlName="validFrom" />
          </div>
          <div class="field">
            <label class="field__label" for="t-to">Válida hasta</label>
            <input id="t-to" class="field__input" type="date" formControlName="validTo" />
          </div>
        </div>

        @if (isEdit) {
          <label class="field-checkbox">
            <input type="checkbox" formControlName="isActive" />
            <span>Tarifa activa</span>
          </label>
        }

        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" (click)="cancel()">Cancelar</button>
          <button type="submit" class="btn btn--primary">
            {{ isEdit ? 'Guardar cambios' : 'Crear tarifa' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .dialog { background: var(--color-surface); border-radius: var(--radius-lg); padding: var(--space-6); width: min(540px, 95vw); box-shadow: var(--shadow-3); display: flex; flex-direction: column; gap: var(--space-5); }
    .dialog__header { border-bottom: 1px solid var(--color-border); padding-bottom: var(--space-4); }
    .dialog__title { font-size: var(--text-lg); font-weight: var(--font-weight-semibold); margin: 0; }
    .dialog__body { display: flex; flex-direction: column; gap: var(--space-4); }
    .dialog__actions { display: flex; gap: var(--space-3); justify-content: flex-end; padding-top: var(--space-2); border-top: 1px solid var(--color-border); }
    .field { display: flex; flex-direction: column; gap: var(--space-1); }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
    .field__label { font-size: var(--text-sm); font-weight: var(--font-weight-medium); color: var(--color-text); }
    .field__hint { font-size: var(--text-xs); color: var(--color-text-muted); }
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
export class TariffEditDialogComponent implements OnInit {
  protected readonly data = inject<TariffDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<TariffFormValue | null>);
  private readonly tariffForms = inject(TariffForms);

  protected form!: FormGroup;
  protected readonly vehicleTypes = VEHICLE_TYPES;
  protected readonly units = UNITS;
  protected get isEdit(): boolean { return this.data.tariff !== null; }

  ngOnInit(): void {
    const t = this.data.tariff;
    this.form = this.tariffForms.createTariffForm(t ? {
      name: t.name,
      vehicleType: t.vehicleType,
      unit: t.unit,
      valueCents: t.valueCents,
      graceMinutes: t.graceMinutes,
      dailyCapCents: t.dailyCapCents,
      ...(t.validFrom ? { validFrom: t.validFrom.toISOString().slice(0, 10) } : {}),
      ...(t.validTo ? { validTo: t.validTo.toISOString().slice(0, 10) } : {}),
      isActive: t.isActive,
    } : undefined);

    if (this.isEdit) {
      this.form.get('vehicleType')?.disable();
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
    this.dialogRef.close(this.form.getRawValue() as TariffFormValue);
  }

  protected cancel(): void {
    this.dialogRef.close(null);
  }
}
