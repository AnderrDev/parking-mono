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
import { LIST_CUSTOMERS_TOKEN } from '../../../../core/di/injection-tokens';
import { ListCustomersUseCase } from '../../../customers/domain/usecases/list-customers.usecase';
import { CustomerEntity } from '../../../customers/domain/entities/customer.entity';

export interface ExitFormValue {
  paymentMethod: PaymentMethod;
  justification: string;
  emitInvoice: boolean;
  /** HU-029: monto recibido cuando paymentMethod=efectivo. */
  cashReceivedCents: number | null;
  /** HU-040: cliente seleccionado para factura electrónica. */
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
  readonly emitInvoice = signal(false);
  readonly paymentMethod = signal<PaymentMethod>('efectivo');

  // HU-029: cambio = recibido - cobro. Negativo si falta dinero.
  readonly changeCents = computed<number | null>(() => {
    const received = this.cashReceived();
    const due = this.amountCents();
    if (received === null || isNaN(received)) return null;
    return received - due;
  });

  // HU-040: búsqueda de cliente
  readonly customerQuery = signal('');
  readonly customerResults = signal<CustomerEntity[]>([]);
  readonly customerSearchLoading = signal(false);
  readonly selectedCustomer = signal<CustomerEntity | null>(null);

  readonly paymentMethodEntries = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
    value: value as PaymentMethod,
    label,
  }));

  readonly formatDuration = formatDuration;
  readonly formatCOP = copFormatter;

  private readonly destroy$ = new Subject<void>();
  private customerSearchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    @Inject(LIST_CUSTOMERS_TOKEN) private readonly listCustomers: ListCustomersUseCase,
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

    this.form.get('emitInvoice')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((value: boolean) => {
        this.emitInvoice.set(value);
        if (!value) {
          // Si destildaron factura, limpiar selección de cliente
          this.selectedCustomer.set(null);
          this.form.get('customerId')!.setValue(null, { emitEvent: false });
          this.form.get('customerId')!.clearValidators();
          this.form.get('customerId')!.updateValueAndValidity({ emitEvent: false });
        } else {
          this.form.get('customerId')!.setValidators([Validators.required]);
          this.form.get('customerId')!.updateValueAndValidity({ emitEvent: false });
        }
      });

    // Trigger initial state
    this.applyDynamicValidators(this.paymentMethod(), FREE_PAYMENT_METHODS.includes(this.paymentMethod()));
    this.showJustification.set(FREE_PAYMENT_METHODS.includes(this.paymentMethod()));
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
    if (this.customerSearchTimer) clearTimeout(this.customerSearchTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  formatEntryTime(): string {
    return this.data.session.entryAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  vehicleTypeLabel(t: VehicleType): string {
    return VEHICLE_TYPE_LABEL[t] ?? t;
  }

  // HU-040: buscador de cliente con debounce 300ms
  onCustomerSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.customerQuery.set(value);

    if (this.customerSearchTimer) clearTimeout(this.customerSearchTimer);
    if (value.length < 3) {
      this.customerResults.set([]);
      return;
    }

    this.customerSearchTimer = setTimeout(async () => {
      this.customerSearchLoading.set(true);
      const result = await this.listCustomers.execute({
        search: value,
        includeDeleted: false,
        pagination: { page: 1, pageSize: 10 },
      });
      this.customerSearchLoading.set(false);
      result.fold(
        () => this.customerResults.set([]),
        (r) => this.customerResults.set(r.data),
      );
    }, 300);
  }

  selectCustomer(customer: CustomerEntity): void {
    this.selectedCustomer.set(customer);
    this.form.get('customerId')!.setValue(customer.id);
    this.customerResults.set([]);
    this.customerQuery.set('');
  }

  clearCustomer(): void {
    this.selectedCustomer.set(null);
    this.form.get('customerId')!.setValue(null);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue() as {
      paymentMethod: PaymentMethod;
      justification: string;
      emitInvoice: boolean;
      cashReceivedCents: number | null;
      customerId: string | null;
    };
    this.dialogRef.close({
      paymentMethod: raw.paymentMethod,
      justification: raw.justification ?? '',
      emitInvoice: raw.emitInvoice ?? false,
      cashReceivedCents: raw.cashReceivedCents,
      customerId: raw.customerId,
    });
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
  }
}
