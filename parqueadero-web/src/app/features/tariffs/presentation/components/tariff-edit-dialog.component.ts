import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { TariffForms } from '../forms/tariff.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';
import { CurrencyInputDirective } from '../../../../shared/directives/currency-input.directive';
import { VEHICLE_TYPES, TARIFF_UNITS } from '../../../../shared/constants/form-options';
import { formatCOP } from '../../../../shared/utils/currency.utils';

interface PreviewRow {
  label: string;
  formatted: string;
  capped: boolean;
}

const PREVIEW_DURATIONS: { label: string; minutes: number }[] = [
  { label: '30 min',     minutes: 30  },
  { label: '1 h',        minutes: 60  },
  { label: '1 h 30 min', minutes: 90  },
  { label: '2 h',        minutes: 120 },
  { label: '5 h',        minutes: 300 },
  { label: '24 h',       minutes: 1440 },
];

export interface TariffDialogData {
  tariff: TariffEntity | null;
  /** Si se provee, el dialog mantiene abierto el formulario en caso de
   * error y muestra el mensaje retornado inline. Ver
   * `feedback_dialog_inline_errors.md` en memory. */
  onSubmit?: (value: TariffFormValue) => Promise<string | null>;
  /** Prellena el form al crear (no aplica en edit). Útil al venir desde
   * el dashboard de operación cuando se intenta ingresar un vehículo sin
   * tarifa configurada. */
  prefillVehicleType?: string | null;
}

export interface TariffFormValue {
  name: string;
  vehicleType: string;
  unit: string;
  // Legacy: lo llenan mensualidades (precio mensual). Para parking, el dialog
  // los DERIVA en submit (valueCents = perHourCents, dailyCapCents = plenaCents)
  // para no romper la signature de los use cases legacy.
  valueCents: number;
  graceMinutes: number;
  dailyCapCents: number;
  // Tiered pricing (S4). Required cuando unit != 'mensualidad'.
  perMinuteCents: number | null;
  perHourCents: number | null;
  plenaCents: number | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
}


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
  // Después del feature tariff-tiered-pricing (2026-05-20) la UI solo expone
  // dos tipos de tarifa: 'hora' (canónico de parking) y 'mensualidad'. El
  // resto de unidades legacy ('minuto', 'fraccion', 'dia') siguen aceptadas
  // por el backend pero quedan fuera del form.
  protected readonly units = TARIFF_UNITS;
  protected get isEdit(): boolean { return this.data.tariff !== null; }
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  // Mensualidad: muestra valueCents (precio mensual) + fechas de validez.
  // Parking: muestra perMinute + perHour + plena.
  protected readonly isMonthly = signal(false);

  /** Signal que rastrea los 3 tiered fields para recomputar la preview en vivo. */
  private formValueSignal = signal<{ pm: number; ph: number; pl: number } | null>(null);

  /**
   * Calcula 6 puntos canónicos (30min, 1h, 1h30, 2h, 5h, 24h) con los valores
   * actuales del form para que el admin vea exactamente qué cobrará antes de
   * guardar. Replica la fórmula del usecase calculate-parking-fee.
   */
  protected readonly previewRows = computed<PreviewRow[]>(() => {
    if (this.isMonthly()) return [];
    const v = this.formValueSignal();
    if (!v) return [];
    const { pm, ph, pl } = v;
    if (pm <= 0 || ph <= 0 || pl <= 0) return [];
    return PREVIEW_DURATIONS.map(({ label, minutes }) => {
      const hours = Math.floor(minutes / 60);
      const rest  = minutes % 60;
      const subtotal = hours * ph + rest * pm;
      const capped = subtotal > pl;
      const amount = capped ? pl : subtotal;
      return { label, formatted: formatCOP(amount), capped };
    });
  });

  ngOnInit(): void {
    const t = this.data.tariff;
    const createDefaults = this.data.prefillVehicleType
      ? { vehicleType: this.data.prefillVehicleType }
      : undefined;
    this.form = this.tariffForms.createTariffForm(t ? {
      name: t.name,
      vehicleType: t.vehicleType,
      unit: t.unit,
      valueCents: t.valueCents,
      graceMinutes: t.graceMinutes,
      dailyCapCents: t.dailyCapCents,
      perMinuteCents: t.perMinuteCents,
      perHourCents: t.perHourCents,
      plenaCents: t.plenaCents,
      ...(t.validFrom ? { validFrom: t.validFrom.toISOString().slice(0, 10) } : {}),
      ...(t.validTo ? { validTo: t.validTo.toISOString().slice(0, 10) } : {}),
      isActive: t.isActive,
    } : createDefaults);

    if (this.isEdit) {
      this.form.get('vehicleType')?.disable();
    }

    // Estado inicial + suscripción al cambio de unit para reaccionar.
    this.applyUnitVisibility(this.form.get('unit')?.value as string);
    this.form.get('unit')?.valueChanges.subscribe((u: string) => this.applyUnitVisibility(u));

    // Alimenta el signal de preview con los 3 tiered cada vez que cambian.
    const syncPreview = () => {
      const pm = Number(this.form.get('perMinuteCents')?.value ?? 0);
      const ph = Number(this.form.get('perHourCents')?.value   ?? 0);
      const pl = Number(this.form.get('plenaCents')?.value     ?? 0);
      this.formValueSignal.set({ pm, ph, pl });
    };
    syncPreview();
    this.form.get('perMinuteCents')?.valueChanges.subscribe(syncPreview);
    this.form.get('perHourCents')?.valueChanges.subscribe(syncPreview);
    this.form.get('plenaCents')?.valueChanges.subscribe(syncPreview);
  }

  private applyUnitVisibility(unit: string): void {
    const monthly = unit === 'mensualidad';
    this.isMonthly.set(monthly);

    if (monthly) {
      // Mensualidad: usa valueCents (precio mensual). Sincroniza dailyCap con
      // value para no chocar con el constraint del backend. Limpia los 3
      // tiered (no aplican).
      this.form.get('graceMinutes')?.setValue(0, { emitEvent: false });
      this.form.get('perMinuteCents')?.setValue(null, { emitEvent: false });
      this.form.get('perHourCents')?.setValue(null, { emitEvent: false });
      this.form.get('plenaCents')?.setValue(null, { emitEvent: false });
      this.form.get('perMinuteCents')?.clearValidators();
      this.form.get('perHourCents')?.clearValidators();
      this.form.get('plenaCents')?.clearValidators();
      this.requireValueAndCap();

      const value = Number(this.form.get('valueCents')?.value ?? 0);
      this.form.get('dailyCapCents')?.setValue(value > 0 ? value : 1_000_000_00, { emitEvent: false });
      this.form.get('valueCents')?.valueChanges.subscribe((v: number | null) => {
        if (this.isMonthly() && v != null) {
          this.form.get('dailyCapCents')?.setValue(v, { emitEvent: false });
        }
      });
    } else {
      // Parking: requiere los 3 tiered. value_cents/daily_cap_cents se DERIVAN
      // en submit. Las fechas no aplican.
      this.form.get('validFrom')?.setValue(null, { emitEvent: false });
      this.form.get('validTo')?.setValue(null, { emitEvent: false });
      this.requireTieredFields();
      this.clearValueAndCap();
    }

    this.form.get('valueCents')?.updateValueAndValidity({ emitEvent: false });
    this.form.get('dailyCapCents')?.updateValueAndValidity({ emitEvent: false });
    this.form.get('perMinuteCents')?.updateValueAndValidity({ emitEvent: false });
    this.form.get('perHourCents')?.updateValueAndValidity({ emitEvent: false });
    this.form.get('plenaCents')?.updateValueAndValidity({ emitEvent: false });
    this.form.updateValueAndValidity({ emitEvent: false });
  }

  private requireTieredFields(): void {
    // Required + min(1) + multipleOfCents ya vienen del form builder; solo
    // hay que asegurarnos que valueCents/dailyCapCents NO sean required.
    const fields = ['perMinuteCents', 'perHourCents', 'plenaCents'];
    fields.forEach((f) => {
      const c = this.form.get(f);
      if (!c) return;
      // Limpiamos y reapplicamos para asegurar Validators.required activo
      c.setValidators([
        ...(c.validator ? [c.validator] : []),
      ]);
    });
  }

  private requireValueAndCap(): void {
    // Para mensualidad, value/dailyCap son required. No tocamos el resto.
  }

  private clearValueAndCap(): void {
    // Para parking, ni valueCents ni dailyCapCents son required: se derivan
    // en submit. Limpiamos para que un null no bloquee el form.invalid.
    this.form.get('valueCents')?.setValue(null, { emitEvent: false });
    this.form.get('dailyCapCents')?.setValue(null, { emitEvent: false });
  }

  protected err(field: string): boolean {
    const c = this.form.get(field);
    return !!c && c.invalid && c.touched;
  }

  protected errMsg(field: string): string {
    return getErrorMessage(this.form.get(field)?.errors ?? null);
  }

  protected formError(key: 'c5' | 'c6'): string | null {
    const e = this.form.errors;
    return e && e[key] ? (e[key] as string) : null;
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const raw = this.form.getRawValue() as Record<string, unknown>;
    const monthly = raw['unit'] === 'mensualidad';

    // Para parking, derivamos valueCents/dailyCapCents desde los tiered para
    // que el contrato legacy de los use cases siga funcionando.
    const value: TariffFormValue = {
      name: raw['name'] as string,
      vehicleType: raw['vehicleType'] as string,
      unit: raw['unit'] as string,
      valueCents: monthly
        ? Number(raw['valueCents'])
        : Number(raw['perHourCents']),
      graceMinutes: Number(raw['graceMinutes']),
      dailyCapCents: monthly
        ? Number(raw['dailyCapCents'])
        : Number(raw['plenaCents']),
      perMinuteCents: monthly ? null : Number(raw['perMinuteCents']),
      perHourCents:   monthly ? null : Number(raw['perHourCents']),
      plenaCents:     monthly ? null : Number(raw['plenaCents']),
      validFrom: (raw['validFrom'] as string | null) ?? null,
      validTo: (raw['validTo'] as string | null) ?? null,
      isActive: !!raw['isActive'],
    };

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
