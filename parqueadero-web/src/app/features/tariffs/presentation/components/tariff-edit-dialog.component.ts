import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { TariffForms } from '../forms/tariff.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';
import { CurrencyInputDirective } from '../../../../shared/directives/currency-input.directive';

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
  imports: [ReactiveFormsModule, CurrencyInputDirective],
  templateUrl: './tariff-edit-dialog.component.html',
  styleUrl: './tariff-edit-dialog.component.scss',
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
