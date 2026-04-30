import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import { VehicleForms } from '../forms/vehicle.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';

export interface VehicleDialogData {
  vehicle: VehicleEntity | null;
}

export interface VehicleFormValue {
  plate: string;
  vehicleType: string;
  color: string | null;
  brand: string | null;
  ownerCustomerId: string | null;
}

const VEHICLE_TYPES = [
  { value: 'carro', label: 'Carro' },
  { value: 'moto', label: 'Moto' },
  { value: 'bicicleta', label: 'Bicicleta' },
  { value: 'otro', label: 'Otro' },
];

@Component({
  selector: 'app-vehicle-edit-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="vehicle-dialog-title">
      <header class="dialog__header">
        <h2 class="dialog__title" id="vehicle-dialog-title">
          {{ isEdit ? 'Editar vehículo' : 'Nuevo vehículo' }}
        </h2>
      </header>

      <form class="dialog__body" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field-row">
          <div class="field">
            <label class="field__label" for="v-plate">Placa</label>
            <input id="v-plate" class="field__input" [class.field__input--error]="err('plate')"
              type="text" formControlName="plate" placeholder="ABC123"
              style="text-transform: uppercase"
              [attr.aria-describedby]="err('plate') ? 'v-plate-err' : null" />
            @if (err('plate')) {
              <span id="v-plate-err" class="field__error" role="alert">{{ errMsg('plate') }}</span>
            }
            @if (isEdit) {
              <span class="field__hint">La placa no se puede cambiar</span>
            }
          </div>

          <div class="field">
            <label class="field__label" for="v-type">Tipo de vehículo</label>
            <select id="v-type" class="field__select" formControlName="vehicleType">
              @for (vt of vehicleTypes; track vt.value) {
                <option [value]="vt.value">{{ vt.label }}</option>
              }
            </select>
            @if (isEdit) {
              <span class="field__hint">El tipo no se puede cambiar</span>
            }
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field__label" for="v-color">Color</label>
            <input id="v-color" class="field__input"
              type="text" formControlName="color" placeholder="Rojo" />
          </div>
          <div class="field">
            <label class="field__label" for="v-brand">Marca</label>
            <input id="v-brand" class="field__input"
              type="text" formControlName="brand" placeholder="Toyota" />
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="v-owner">ID de cliente propietario (UUID, opcional)</label>
          <input id="v-owner" class="field__input"
            type="text" formControlName="ownerCustomerId" placeholder="Dejar vacío si no tiene propietario" />
        </div>

        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" (click)="cancel()">Cancelar</button>
          <button type="submit" class="btn btn--primary">
            {{ isEdit ? 'Guardar cambios' : 'Registrar vehículo' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .dialog { background: var(--color-surface); border-radius: var(--radius-lg); padding: var(--space-6); width: min(520px, 95vw); box-shadow: var(--shadow-3); display: flex; flex-direction: column; gap: var(--space-5); }
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
    .btn { padding: var(--space-2) var(--space-5); border-radius: var(--radius-md); font-weight: var(--font-weight-semibold); font-size: var(--text-base); min-height: var(--touch-target-secondary); cursor: pointer; }
    .btn--ghost { background: var(--color-surface-2); color: var(--color-text); border: 1px solid var(--color-border); }
    .btn--primary { background: var(--color-primary); color: var(--color-primary-fg); }
    @media (max-width: 480px) { .field-row { grid-template-columns: 1fr; } }
  `],
})
export class VehicleEditDialogComponent implements OnInit {
  protected readonly data = inject<VehicleDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<VehicleFormValue | null>);
  private readonly vehicleForms = inject(VehicleForms);

  protected form!: FormGroup;
  protected readonly vehicleTypes = VEHICLE_TYPES;
  protected get isEdit(): boolean { return this.data.vehicle !== null; }

  ngOnInit(): void {
    const v = this.data.vehicle;
    this.form = this.vehicleForms.createVehicleForm(v ? {
      plate: v.plate,
      vehicleType: v.vehicleType,
      color: v.color,
      brand: v.brand,
      ownerCustomerId: v.ownerCustomerId,
    } : undefined);

    if (this.isEdit) {
      this.form.get('plate')?.disable();
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
    this.dialogRef.close(this.form.getRawValue() as VehicleFormValue);
  }

  protected cancel(): void { this.dialogRef.close(null); }
}
