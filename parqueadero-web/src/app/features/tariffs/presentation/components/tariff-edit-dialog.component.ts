import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { TariffForms } from '../forms/tariff.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';
import { CurrencyInputDirective } from '../../../../shared/directives/currency-input.directive';

export interface TariffDialogData {
  tariff: TariffEntity | null;
  /** Si se provee, el dialog mantiene abierto el formulario en caso de
   * error y muestra el mensaje retornado inline. Ver
   * `feedback_dialog_inline_errors.md` en memory. */
  onSubmit?: (value: TariffFormValue) => Promise<string | null>;
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

// 'dia' eliminado del selector — no se usa en este parqueadero. El tipo
// TariffUnit lo conserva para compatibilidad con tarifas legacy en BD.
const UNITS = [
  { value: 'hora', label: 'Por hora' },
  { value: 'fraccion', label: 'Por fracción (30 min)' },
  { value: 'minuto', label: 'Por minuto' },
  { value: 'mensualidad', label: 'Mensualidad (mes completo)' },
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
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  // Mensualidad: oculta minutos de gracia y tope diario (no aplican); muestra
  // fechas de validez. Otras unidades: al revés. Sigue el `unit` del form.
  protected readonly isMonthly = signal(false);

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

    // Estado inicial + suscripción al cambio de unit para reaccionar.
    this.applyUnitVisibility(this.form.get('unit')?.value as string);
    this.form.get('unit')?.valueChanges.subscribe((u: string) => this.applyUnitVisibility(u));
  }

  private applyUnitVisibility(unit: string): void {
    const monthly = unit === 'mensualidad';
    this.isMonthly.set(monthly);

    if (monthly) {
      // Mensualidad: grace y dailyCap no aplican. Set defaults para satisfacer
      // los validators del backend (grace_minutes ≥ 0, daily_cap > 0). El
      // dailyCap se sincroniza con el valor para no chocar con cobros.
      this.form.get('graceMinutes')?.setValue(0, { emitEvent: false });
      const value = Number(this.form.get('valueCents')?.value ?? 0);
      this.form.get('dailyCapCents')?.setValue(value > 0 ? value : 1_000_000_00, { emitEvent: false });
      // Mantener cap sincronizado con value mientras siga en mensualidad.
      this.form.get('valueCents')?.valueChanges.subscribe((v: number | null) => {
        if (this.isMonthly() && v != null) {
          this.form.get('dailyCapCents')?.setValue(v, { emitEvent: false });
        }
      });
    } else {
      // No-mensualidad: las fechas de validez se ocultan; default null.
      this.form.get('validFrom')?.setValue(null, { emitEvent: false });
      this.form.get('validTo')?.setValue(null, { emitEvent: false });
    }
  }

  protected err(field: string): boolean {
    const c = this.form.get(field);
    return !!c && c.invalid && c.touched;
  }

  protected errMsg(field: string): string {
    return getErrorMessage(this.form.get(field)?.errors ?? null);
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue() as TariffFormValue;

    if (this.data.onSubmit) {
      this.submitting.set(true);
      this.submitError.set(null);
      const errorMsg = await this.data.onSubmit(value);
      this.submitting.set(false);
      if (errorMsg) {
        this.submitError.set(errorMsg);
        return;
      }
      this.dialogRef.close(value);
      return;
    }
    this.dialogRef.close(value);
  }

  protected cancel(): void {
    this.dialogRef.close(null);
  }
}
