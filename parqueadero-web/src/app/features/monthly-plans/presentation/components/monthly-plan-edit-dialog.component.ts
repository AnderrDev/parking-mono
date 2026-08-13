import { ChangeDetectionStrategy, Component, Inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { MonthlyPlanForms } from '../forms/monthly-plan.forms';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';
import { CurrencyCopPipe } from '../../../../shared/pipes/currency-cop.pipe';
import { CurrencyInputDirective } from '../../../../shared/directives/currency-input.directive';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import {
  LIST_CUSTOMERS_TOKEN, CREATE_CUSTOMER_TOKEN, GET_ACTIVE_PLAN_TARIFF_TOKEN,
  CUSTOMER_REPOSITORY_TOKEN, CUSTOMER_REMOTE_DATASOURCE_TOKEN,
  TARIFF_REPOSITORY_TOKEN, TARIFF_REMOTE_DATASOURCE_TOKEN,
} from '../../../../core/di/injection-tokens';
import { ListCustomersUseCase } from '../../../customers/domain/usecases/list-customers.usecase';
import { CreateCustomerUseCase } from '../../../customers/domain/usecases/create-customer.usecase';
import { GetActivePlanTariffUseCase } from '../../../tariffs/domain/usecases/get-active-plan-tariff.usecase';
import { CustomerRemoteDataSource } from '../../../customers/data/datasources/customer-remote.datasource';
import { CustomerRepositoryImpl } from '../../../customers/data/repositories/customer.repository.impl';
import { TariffRemoteDataSource } from '../../../tariffs/data/datasources/tariff-remote.datasource';
import { TariffRepositoryImpl } from '../../../tariffs/data/repositories/tariff.repository.impl';
import { CustomerEntity, DocType } from '../../../customers/domain/entities/customer.entity';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';
import { PlanTariffUnit } from '../../../parking/domain/entities/tariff.entity';
import { normalizePlate } from '../../../../shared/utils/plate.utils';
import { formatIsoDateOnly, parseIsoDateOnly } from '../../../../shared/utils/date.utils';
import {
  DOC_TYPES, VEHICLE_TYPES, PLAN_TYPES, PAYMENT_METHODS_PLAN, PLAN_DURATIONS,
} from '../../../../shared/constants/form-options';

const DEFAULT_CUSTOMER = {
  name: 'Cliente General',
  docType: 'cedula' as DocType,
  docNumber: '9999999999',
};

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
  /** 'quincena' | 'mensualidad'. Solo UI: en BD la duración son las fechas. */
  duration: string;
  startDate: string;
  endDate: string;
  amountCents: number;
  paymentMethod: string;
  /** Snapshot del cliente seleccionado para imprimir comprobante sin
   * tener que re-consultar la BD desde la page. */
  customerSnapshot?: { name: string; docType: string; docNumber: string } | null;
}


@Component({
  selector: 'app-monthly-plan-edit-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CurrencyCopPipe, CurrencyInputDirective, LoadingSpinnerComponent],
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
    { provide: GET_ACTIVE_PLAN_TARIFF_TOKEN, useClass: GetActivePlanTariffUseCase },
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
  protected readonly docTypes = DOC_TYPES;

  protected form!: FormGroup;
  protected readonly planTypes = PLAN_TYPES;
  protected readonly paymentMethods = PAYMENT_METHODS_PLAN;
  protected readonly vehicleTypes = VEHICLE_TYPES;
  protected readonly durations = PLAN_DURATIONS;
  protected readonly tariffNotConfigured = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected get isEdit(): boolean { return this.data.plan !== null; }

  constructor(
    @Inject(DIALOG_DATA) protected readonly data: MonthlyPlanDialogData,
    private readonly dialogRef: DialogRef<MonthlyPlanFormValue | null>,
    private readonly planForms: MonthlyPlanForms,
    private readonly fb: FormBuilder,
    @Inject(LIST_CUSTOMERS_TOKEN) private readonly listCustomers: ListCustomersUseCase,
    @Inject(CREATE_CUSTOMER_TOKEN) private readonly createCustomer: CreateCustomerUseCase,
    @Inject(GET_ACTIVE_PLAN_TARIFF_TOKEN) private readonly getPlanTariff: GetActivePlanTariffUseCase,
  ) {}

  ngOnInit(): void {
    const p = this.data.plan;
    this.form = this.planForms.createPlanForm(p ? {
      vehiclePlate: p.vehiclePlate,
      customerId: p.customerId,
      planType: p.planType,
      startDate: formatIsoDateOnly(p.startDate),
      endDate: formatIsoDateOnly(p.endDate),
      amountCents: p.amountCents,
    } : undefined);

    if (this.isEdit) {
      ['vehiclePlate', 'customerId', 'planType', 'startDate'].forEach(f => this.form.get(f)?.disable());
    }

    // Fecha fin siempre deshabilitada y derivada de inicio + duración. El
    // control sigue en el form (vía getRawValue) pero no se edita a mano.
    this.form.get('endDate')?.disable({ emitEvent: false });

    // En modo crear, el vencimiento se recalcula cuando cambia la fecha de
    // inicio o la duración elegida (quincena / mensualidad).
    if (!this.isEdit) {
      this.syncEndDate();
      this.form.get('startDate')?.valueChanges.subscribe(() => this.syncEndDate());
      this.form.get('duration')?.valueChanges.subscribe(() => {
        this.syncEndDate();
        this.loadTariff();
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
      this.loadTariff();
      this.form.get('vehicleType')?.valueChanges.subscribe(() => this.loadTariff());
    }
  }

  /**
   * Vencimiento = inicio + los días de la duración, MENOS uno: `end_date` es
   * el último día cubierto y cuenta completo. Sin el `- 1`, una duración de
   * 30 días vendía 31 (del 12-ago al 11-sep) y el comprobante impreso lo
   * delataba junto a la etiqueta "30 días" del formulario.
   */
  private syncEndDate(): void {
    const iso = this.form.get('startDate')?.value as string | null;
    if (!iso) return;
    const days = this.durationDays();
    const end = parseIsoDateOnly(iso);
    end.setDate(end.getDate() + days - 1);
    this.form.get('endDate')?.setValue(formatIsoDateOnly(end), { emitEvent: false });
  }

  private durationDays(): number {
    const value = this.form.get('duration')?.value as string;
    return PLAN_DURATIONS.find(d => d.value === value)?.days ?? 30;
  }

  private async loadTariff(): Promise<void> {
    const type = this.form.get('vehicleType')?.value as VehicleType;
    const unit = this.form.get('duration')?.value as PlanTariffUnit;
    if (!type || !unit) return;
    const result = await this.getPlanTariff.execute({ vehicleType: type, unit });
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

    // `submitting` cubre TODA la operación, no solo la llamada final: la
    // resolución del cliente también va contra la red y sin esto el botón
    // se veía inerte mientras el diálogo ya estaba trabajando.
    this.submitting.set(true);
    this.submitError.set(null);
    try {
      const value = this.form.getRawValue() as MonthlyPlanFormValue;

      // El cliente es opcional para quien vende, pero `monthly_plans.
      // customer_id` es NOT NULL en la BD. Si no eligió ninguno, la venta
      // queda a nombre del Cliente General SIN tocar el campo en pantalla:
      // antes se seleccionaba de verdad y al operador le aparecía de la nada
      // una cédula que él no había escrito.
      let customer = this.selectedCustomer();
      if (!this.isEdit && !value.customerId) {
        customer = await this.ensureDefaultCustomer();
        if (!customer) return;
        value.customerId = customer.id;
      }

      // Snapshot del cliente para imprimir el comprobante sin re-consultar.
      const valueWithCustomer: MonthlyPlanFormValue = {
        ...value,
        customerSnapshot: customer
          ? { name: customer.name, docType: customer.docType, docNumber: customer.docNumber }
          : null,
      };

      // Con `onSubmit`, el padre ejecuta el use case y el diálogo sigue
      // abierto si el backend rechaza, para no perder lo ya digitado.
      if (this.data.onSubmit) {
        const errorMsg = await this.data.onSubmit(valueWithCustomer);
        if (errorMsg) {
          this.submitError.set(errorMsg);
          return;
        }
      }
      this.dialogRef.close(valueWithCustomer);
    } finally {
      this.submitting.set(false);
    }
  }

  protected cancel(): void { this.dialogRef.close(null); }

  private async ensureDefaultCustomer(): Promise<CustomerEntity | null> {
    // pageSize mínimo aceptado por ListCustomersUseCase es 10: pedir menos
    // devuelve ValidationFailure y el Cliente General existente quedaría
    // invisible, llevando a intentar crearlo de nuevo contra el UNIQUE.
    const existing = await this.listCustomers.execute({
      search: DEFAULT_CUSTOMER.docNumber,
      includeDeleted: false,
      pagination: { page: 1, pageSize: 10 },
    });
    if (existing.isLeft()) {
      this.submitError.set(`No se pudo buscar Cliente General: ${existing.value.message}`);
      return null;
    }
    // Match exacto: la búsqueda es un ilike parcial y podría traer otros
    // documentos que contengan la cadena.
    const found = existing.value.data.find(c => c.docNumber === DEFAULT_CUSTOMER.docNumber) ?? null;
    if (found) return found;

    const created = await this.createCustomer.execute({
      name: DEFAULT_CUSTOMER.name,
      docType: DEFAULT_CUSTOMER.docType,
      docNumber: DEFAULT_CUSTOMER.docNumber,
      dv: null,
    });
    return created.fold(
      (failure) => {
        this.submitError.set(`No se pudo preparar Cliente General: ${failure.message}`);
        return null;
      },
      (customer) => customer,
    );
  }
}
