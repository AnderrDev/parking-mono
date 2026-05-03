import { ChangeDetectionStrategy, Component, Inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { MonthlyPlanForms } from '../forms/monthly-plan.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';
import { CurrencyCopPipe } from '../../../../shared/pipes/currency-cop.pipe';
import { CurrencyInputDirective } from '../../../../shared/directives/currency-input.directive';
import {
  LIST_CUSTOMERS_TOKEN, CREATE_CUSTOMER_TOKEN, GET_ACTIVE_MONTHLY_TARIFF_TOKEN,
  CUSTOMER_REPOSITORY_TOKEN, CUSTOMER_REMOTE_DATASOURCE_TOKEN,
  TARIFF_REPOSITORY_TOKEN, TARIFF_REMOTE_DATASOURCE_TOKEN,
} from '../../../../core/di/injection-tokens';
import { ListCustomersUseCase } from '../../../customers/domain/usecases/list-customers.usecase';
import { CreateCustomerUseCase } from '../../../customers/domain/usecases/create-customer.usecase';
import { GetActiveMonthlyTariffUseCase } from '../../../tariffs/domain/usecases/get-active-monthly-tariff.usecase';
import { CustomerRemoteDataSource } from '../../../customers/data/datasources/customer-remote.datasource';
import { CustomerRepositoryImpl } from '../../../customers/data/repositories/customer.repository.impl';
import { TariffRemoteDataSource } from '../../../tariffs/data/datasources/tariff-remote.datasource';
import { TariffRepositoryImpl } from '../../../tariffs/data/repositories/tariff.repository.impl';
import { CustomerEntity, DocType } from '../../../customers/domain/entities/customer.entity';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';
import { normalizePlate } from '../../../../shared/utils/plate.utils';
import { todayIsoBogota } from '../../../../shared/utils/date.utils';

export interface MonthlyPlanDialogData {
  plan: MonthlyPlanEntity | null;
  /**
   * Callback que ejecuta la persistencia (create/update). Si retorna null,
   * el dialog se cierra con éxito; si retorna string, ese mensaje se muestra
   * como error inline y el dialog NO se cierra. Este patrón evita que el
   * usuario pierda los datos cargados cuando el backend rechaza.
   */
  onSubmit?: (value: MonthlyPlanFormValue) => Promise<string | null>;
}

export interface MonthlyPlanFormValue {
  vehiclePlate: string;
  customerId: string;
  planType: string;
  vehicleType: string;
  startDate: string;
  endDate: string;
  amountCents: number;
  autoRenew: boolean;
  paymentTokenId: string | null;
  paymentMethod: string;
  /** Snapshot del cliente seleccionado para imprimir comprobante sin
   * tener que re-consultar la BD desde la page. */
  customerSnapshot?: { name: string; docType: string; docNumber: string } | null;
}

const PLAN_TYPES = [
  { value: 'basico', label: 'Básico' },
  { value: 'premium', label: 'Premium' },
  { value: 'ilimitado', label: 'Ilimitado' },
];

const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta_credito', label: 'Tarjeta crédito' },
  { value: 'tarjeta_debito', label: 'Tarjeta débito' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'nequi', label: 'Nequi' },
  { value: 'daviplata', label: 'Daviplata' },
];

const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: 'carro', label: 'Carro' },
  { value: 'moto', label: 'Moto' },
  { value: 'bicicleta', label: 'Bici' },
  { value: 'otro', label: 'Otro' },
];

@Component({
  selector: 'app-monthly-plan-edit-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CurrencyCopPipe, CurrencyInputDirective],
  templateUrl: './monthly-plan-edit-dialog.component.html',
  styleUrl: './monthly-plan-edit-dialog.component.scss',
  // Providers self-contained: CDK Dialog no hereda fiable los providers
  // del route padre. Declarar acá garantiza que las dependencias del
  // dialog estén disponibles sin importar cómo se abrió.
  // SupabaseService es providedIn root, así que la cadena resuelve.
  providers: [
    { provide: CUSTOMER_REMOTE_DATASOURCE_TOKEN, useClass: CustomerRemoteDataSource },
    { provide: CUSTOMER_REPOSITORY_TOKEN, useClass: CustomerRepositoryImpl },
    { provide: LIST_CUSTOMERS_TOKEN, useClass: ListCustomersUseCase },
    { provide: CREATE_CUSTOMER_TOKEN, useClass: CreateCustomerUseCase },
    { provide: TARIFF_REMOTE_DATASOURCE_TOKEN, useClass: TariffRemoteDataSource },
    { provide: TARIFF_REPOSITORY_TOKEN, useClass: TariffRepositoryImpl },
    { provide: GET_ACTIVE_MONTHLY_TARIFF_TOKEN, useClass: GetActiveMonthlyTariffUseCase },
  ],
})
export class MonthlyPlanEditDialogComponent implements OnInit {
  protected readonly customerQuery = signal('');
  protected readonly customerResults = signal<CustomerEntity[]>([]);
  protected readonly customerSearchLoading = signal(false);
  protected readonly selectedCustomer = signal<CustomerEntity | null>(null);
  private customerSearchTimer: ReturnType<typeof setTimeout> | null = null;

  // Mini-form de creación inline cuando el cliente no existe.
  protected readonly creatingCustomer = signal(false);
  protected readonly creatingCustomerLoading = signal(false);
  protected readonly creatingCustomerError = signal<string | null>(null);
  protected newCustomerForm!: FormGroup;
  protected readonly docTypes: { value: DocType; label: string }[] = [
    { value: 'cedula', label: 'Cédula' },
    { value: 'nit', label: 'NIT' },
    { value: 'pasaporte', label: 'Pasaporte' },
  ];

  protected form!: FormGroup;
  protected readonly planTypes = PLAN_TYPES;
  protected readonly paymentMethods = PAYMENT_METHODS;
  protected readonly vehicleTypes = VEHICLE_TYPES;
  protected readonly tariffNotConfigured = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected get isEdit(): boolean { return this.data.plan !== null; }
  protected readonly todayIso = todayIsoBogota();

  constructor(
    @Inject(DIALOG_DATA) protected readonly data: MonthlyPlanDialogData,
    private readonly dialogRef: DialogRef<MonthlyPlanFormValue | null>,
    private readonly planForms: MonthlyPlanForms,
    private readonly fb: FormBuilder,
    @Inject(LIST_CUSTOMERS_TOKEN) private readonly listCustomers: ListCustomersUseCase,
    @Inject(CREATE_CUSTOMER_TOKEN) private readonly createCustomer: CreateCustomerUseCase,
    @Inject(GET_ACTIVE_MONTHLY_TARIFF_TOKEN) private readonly getMonthlyTariff: GetActiveMonthlyTariffUseCase,
  ) {}

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

    // Fecha fin siempre deshabilitada y auto-calculada: plan mensual = 30 días.
    // El control sigue en el form (vía getRawValue) pero el operador no la edita.
    this.form.get('endDate')?.disable({ emitEvent: false });

    // Si no hay defaults (modo crear), la fecha fin se sincroniza con la
    // fecha inicio + 30 días cada vez que el operador cambia el inicio.
    if (!this.isEdit) {
      this.form.get('startDate')?.valueChanges.subscribe((iso: string | null) => {
        if (!iso) return;
        const parts = iso.split('-');
        const base = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        base.setDate(base.getDate() + 30);
        const endIso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
        this.form.get('endDate')?.setValue(endIso, { emitEvent: false });
      });
    }

    // Auto-uppercase de la placa: el operador puede teclear en cualquier
    // case y el form siempre guarda mayúsculas (validador requiere ABC123).
    this.form.get('vehiclePlate')?.valueChanges.subscribe((value: string | null) => {
      if (typeof value !== 'string') return;
      const normalized = normalizePlate(value);
      if (normalized !== value) {
        this.form.get('vehiclePlate')!.setValue(normalized, { emitEvent: false });
      }
    });

    // Auto-rellenar amountCents según la tarifa de mensualidad del tipo
    // seleccionado. Si no hay tarifa configurada, no toca el monto y
    // muestra hint para que el operador lo digite manualmente.
    if (!this.isEdit) {
      this.loadTariffForType(this.form.get('vehicleType')?.value as VehicleType);
      this.form.get('vehicleType')?.valueChanges.subscribe((t: VehicleType) => {
        this.loadTariffForType(t);
      });
    }
  }

  private async loadTariffForType(type: VehicleType): Promise<void> {
    if (!type) return;
    const result = await this.getMonthlyTariff.execute(type);
    const amountCtrl = this.form.get('amountCents');
    if (!amountCtrl) return;
    result.fold(
      () => {
        // Error de red o servidor: dejar editable y avisar.
        this.tariffNotConfigured.set(true);
        amountCtrl.enable({ emitEvent: false });
      },
      (tariff) => {
        if (tariff) {
          // Tarifa encontrada: rellenar y deshabilitar (es fija por tipo).
          this.tariffNotConfigured.set(false);
          amountCtrl.setValue(tariff.valueCents, { emitEvent: false });
          amountCtrl.disable({ emitEvent: false });
        } else {
          // Sin tarifa para este tipo: editable como fallback.
          this.tariffNotConfigured.set(true);
          amountCtrl.enable({ emitEvent: false });
        }
      },
    );
  }

  protected err(field: string): boolean {
    const c = this.form.get(field);
    return !!c && c.invalid && c.touched;
  }

  protected errMsg(field: string): string {
    return getErrorMessage(this.form.get(field)?.errors ?? null);
  }

  protected onCustomerSearch(event: Event): void {
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

  protected selectCustomer(customer: CustomerEntity): void {
    this.selectedCustomer.set(customer);
    this.form.get('customerId')!.setValue(customer.id);
    this.customerResults.set([]);
    this.customerQuery.set('');
  }

  protected clearCustomer(): void {
    this.selectedCustomer.set(null);
    this.form.get('customerId')!.setValue(null);
  }

  protected openCreateCustomer(): void {
    this.creatingCustomer.set(true);
    this.creatingCustomerError.set(null);
    this.newCustomerForm = this.fb.group({
      name: [this.customerQuery(), [Validators.required, Validators.minLength(2), Validators.maxLength(200)]],
      docType: ['cedula' as DocType, Validators.required],
      docNumber: ['', [Validators.required, Validators.pattern(/^[0-9X]{5,20}$/)]],
      dv: [null as number | null],
    });
  }

  protected cancelCreateCustomer(): void {
    this.creatingCustomer.set(false);
    this.creatingCustomerError.set(null);
  }

  protected async submitCreateCustomer(): Promise<void> {
    this.newCustomerForm.markAllAsTouched();
    if (this.newCustomerForm.invalid) return;

    const raw = this.newCustomerForm.getRawValue() as {
      name: string;
      docType: DocType;
      docNumber: string;
      dv: number | null;
    };

    this.creatingCustomerLoading.set(true);
    this.creatingCustomerError.set(null);

    const result = await this.createCustomer.execute({
      name: raw.name.trim(),
      docType: raw.docType,
      docNumber: raw.docNumber.trim(),
      dv: raw.docType === 'nit' ? raw.dv : null,
    });

    this.creatingCustomerLoading.set(false);

    result.fold(
      (failure) => this.creatingCustomerError.set(failure.message),
      (customer) => {
        this.selectCustomer(customer);
        this.creatingCustomer.set(false);
      },
    );
  }

  protected newCustomerErr(field: string): boolean {
    const c = this.newCustomerForm?.get(field);
    return !!c && c.invalid && c.touched;
  }

  protected newCustomerErrMsg(field: string): string {
    return getErrorMessage(this.newCustomerForm?.get(field)?.errors ?? null);
  }

  protected isNewCustomerNit(): boolean {
    return this.newCustomerForm?.get('docType')?.value === 'nit';
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue() as MonthlyPlanFormValue;

    // Si el padre proveyó onSubmit, dejamos que ejecute el use case y
    // mantenemos el dialog abierto en caso de error inline. Es el patrón
    // recomendado y evita perder los datos cargados al rechazar el backend.
    // Si no hay onSubmit (compatibilidad), cerramos directo con el value.
    // Adjuntar snapshot del cliente para que la page pueda imprimir
    // comprobante sin re-consultar la BD.
    const c = this.selectedCustomer();
    const valueWithCustomer: MonthlyPlanFormValue = {
      ...value,
      customerSnapshot: c ? { name: c.name, docType: c.docType, docNumber: c.docNumber } : null,
    };

    if (this.data.onSubmit) {
      this.submitting.set(true);
      this.submitError.set(null);
      const errorMsg = await this.data.onSubmit(valueWithCustomer);
      this.submitting.set(false);
      if (errorMsg) {
        this.submitError.set(errorMsg);
        return;
      }
      this.dialogRef.close(valueWithCustomer);
      return;
    }
    this.dialogRef.close(valueWithCustomer);
  }

  protected cancel(): void { this.dialogRef.close(null); }
}
