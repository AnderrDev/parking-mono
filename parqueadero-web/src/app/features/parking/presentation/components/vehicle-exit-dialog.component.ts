import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ParkingForms } from '../forms/parking.forms';
import { ParkingSessionEntity, VehicleType } from '../../domain/entities/parking-session.entity';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import { PaymentMethod, FREE_PAYMENT_METHODS } from '../../domain/entities/payment.entity';
import { CalculateParkingFeeResult } from '../../domain/usecases/calculate-parking-fee.usecase';
import { formatDuration } from '../../../../shared/utils/date.utils';
import { formatCOP as copFormatter } from '../../../../shared/utils/currency.utils';
import { CurrencyInputDirective } from '../../../../shared/directives/currency-input.directive';
import { GET_SETTING_TOKEN } from '../../../../core/di/injection-tokens';
import { GetSettingUseCase } from '../../../settings/domain/usecases/get-setting.usecase';
import { OperationalConfigValue } from '../../../settings/domain/entities/app-setting.entity';

export interface ExitFormValue {
  paymentMethod: PaymentMethod;
  justification: string;
  /** HU-029: monto recibido cuando paymentMethod=efectivo. */
  cashReceivedCents: number | null;
  /** Mantenidos para compat con el dashboard del operador. El UI ya no los
   *  expone (2026-05-24): `emitInvoice` siempre false, `customerId` siempre
   *  null. La emisión de ticket interno se hizo opcional desde el dialog. */
  emitInvoice: boolean;
  customerId: string | null;
}

export interface VehicleExitDialogData {
  readonly session: ParkingSessionEntity;
  readonly tariff: TariffEntity | null;
  readonly feeResult: CalculateParkingFeeResult | null;
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  tarjeta_credito: 'Tarjeta Crédito',
  tarjeta_debito: 'Tarjeta Débito',
  transferencia: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  cortesia: 'Cortesía',
  error: 'Error de entrada',
  mensual: 'Plan mensual',
};

/** Métodos cobrables: el admin los toggle desde /settings →
 *  operational_config.enabled_payment_methods. SOLO estos aparecen en el
 *  select. `cortesia` y `error` quedan fuera de la UI por decisión del
 *  usuario (2026-05-24): si en el futuro se requieren, se exponen como
 *  toggles separados en settings. `mensual` aparece SOLO cuando la sesión
 *  tiene plan mensual activo (auto-seleccionado, no elegible). */
const BILLABLE_METHODS: readonly PaymentMethod[] = [
  'efectivo', 'tarjeta_credito', 'tarjeta_debito', 'transferencia', 'nequi', 'daviplata',
];

const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  carro: 'Carro',
  moto: 'Moto',
  bicicleta: 'Bicicleta',
  otro: 'Otro',
};

@Component({
  selector: 'app-vehicle-exit-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CurrencyInputDirective],
  templateUrl: './vehicle-exit-dialog.component.html',
  styleUrl: './vehicle-exit-dialog.component.scss',
})
export class VehicleExitDialogComponent implements OnInit, OnDestroy {
  readonly data = inject<VehicleExitDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<ExitFormValue | undefined, VehicleExitDialogComponent>>(DialogRef);
  private readonly parkingForms = inject(ParkingForms);

  form!: FormGroup;
  readonly showJustification = signal(false);
  readonly cashReceived = signal<number | null>(null);
  readonly paymentMethod = signal<PaymentMethod>('efectivo');

  // HU-029: cambio = recibido - cobro. Negativo si falta dinero.
  readonly changeCents = computed<number | null>(() => {
    const received = this.cashReceived();
    const due = this.amountCents();
    if (received === null || isNaN(received)) return null;
    return received - due;
  });

  /** Set de métodos cobrables habilitados (default = todos hasta que load
   *  resuelva). Se filtra contra BILLABLE_METHODS. */
  private readonly enabledBillable = signal<readonly PaymentMethod[]>(BILLABLE_METHODS);

  readonly paymentMethodEntries = computed(() => {
    // Sesión mensual: el método es siempre 'mensual', sin elección posible.
    if (this.data.session.isMonthly) {
      return [{ value: 'mensual' as PaymentMethod, label: PAYMENT_METHOD_LABELS['mensual'] }];
    }
    // Sesión normal: solo los billables marcados por el admin.
    return this.enabledBillable().map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }));
  });

  readonly formatDuration = formatDuration;
  readonly formatCOP = copFormatter;

  private readonly destroy$ = new Subject<void>();

  constructor(
    @Inject(GET_SETTING_TOKEN) private readonly getSetting: GetSettingUseCase,
  ) {}

  amountCents(): number {
    return this.data.feeResult?.amountCents ?? 0;
  }

  showCashFields(): boolean {
    return this.paymentMethod() === 'efectivo' && this.amountCents() > 0;
  }

  ngOnInit(): void {
    this.form = this.parkingForms.createExitForm();
    this.form.patchValue({
      plate: this.data.session.vehiclePlate,
      vehicleType: this.data.session.vehicleType,
      paymentMethod: this.data.session.isMonthly ? 'mensual' : 'efectivo',
    });

    this.paymentMethod.set(this.form.get('paymentMethod')!.value as PaymentMethod);

    this.form.get('paymentMethod')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((method: PaymentMethod) => {
        this.paymentMethod.set(method);
        const isFree = FREE_PAYMENT_METHODS.includes(method);
        this.showJustification.set(isFree);
        this.applyDynamicValidators(method, isFree);
      });

    this.form.get('cashReceivedCents')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((value: number | string | null) => {
        const num = value === null || value === '' ? null : Number(value);
        this.cashReceived.set(Number.isNaN(num) ? null : num);
      });

    // emitInvoice/customerId quedan fuera del UI (2026-05-24). El form
    // mantiene los campos por compat con el dashboard, pero forzamos
    // valores fijos.
    this.form.get('emitInvoice')!.setValue(false, { emitEvent: false });
    this.form.get('customerId')!.setValue(null, { emitEvent: false });
    this.form.get('customerId')!.clearValidators();
    this.form.get('customerId')!.updateValueAndValidity({ emitEvent: false });

    // Trigger initial state
    this.applyDynamicValidators(this.paymentMethod(), FREE_PAYMENT_METHODS.includes(this.paymentMethod()));
    this.showJustification.set(FREE_PAYMENT_METHODS.includes(this.paymentMethod()));

    // Filtro de métodos según operational_config.enabled_payment_methods.
    // Si el setting falla o trae lista vacía, mantenemos los 6 billables
    // por default (no rompemos el flujo de cobro).
    void this.loadEnabledMethods();
  }

  private async loadEnabledMethods(): Promise<void> {
    const r = await this.getSetting.execute({ key: 'operational_config' });
    r.fold(
      () => {/* fallback al default ya seteado */},
      (entity) => {
        if (!entity) return;
        const v = entity.value as OperationalConfigValue;
        const list = Array.isArray(v.enabled_payment_methods) ? v.enabled_payment_methods : [];
        const filtered = BILLABLE_METHODS.filter((m) => list.includes(m));
        if (filtered.length > 0) this.enabledBillable.set(filtered);
      },
    );
  }

  private applyDynamicValidators(method: PaymentMethod, isFree: boolean): void {
    const justCtl = this.form.get('justification')!;
    if (isFree) {
      justCtl.setValidators([Validators.required, Validators.minLength(3)]);
    } else {
      justCtl.clearValidators();
      justCtl.setValue('', { emitEvent: false });
    }
    justCtl.updateValueAndValidity({ emitEvent: false });

    const cashCtl = this.form.get('cashReceivedCents')!;
    if (method === 'efectivo' && this.amountCents() > 0) {
      cashCtl.setValidators([Validators.required, Validators.min(this.amountCents())]);
    } else {
      cashCtl.clearValidators();
      cashCtl.setValue(null, { emitEvent: false });
    }
    cashCtl.updateValueAndValidity({ emitEvent: false });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  formatEntryTime(): string {
    return this.data.session.entryAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  vehicleTypeLabel(t: VehicleType): string {
    return VEHICLE_TYPE_LABEL[t] ?? t;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue() as {
      paymentMethod: PaymentMethod;
      justification: string;
      cashReceivedCents: number | null;
    };
    this.dialogRef.close({
      paymentMethod: raw.paymentMethod,
      justification: raw.justification ?? '',
      cashReceivedCents: raw.cashReceivedCents,
      // Mantienen valores fijos: la emisión de factura/cliente se eliminó del flujo.
      emitInvoice: false,
      customerId: null,
    });
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
  }
}
