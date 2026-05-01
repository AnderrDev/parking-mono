import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  GET_SETTING_TOKEN,
  UPDATE_SETTING_TOKEN,
} from '../../../../core/di/injection-tokens';
import { SettingsForms, PAYMENT_METHODS as PM } from '../forms/settings.forms';
import { GetSettingUseCase } from '../../domain/usecases/get-setting.usecase';
import { UpdateSettingUseCase } from '../../domain/usecases/update-setting.usecase';
import {
  InvoicingConfigValue,
  OperationalConfigValue,
  ParkingInfoValue,
} from '../../domain/entities/app-setting.entity';
import { ToastService } from '../../../../core/services/toast.service';

type Tab = 'parking' | 'invoicing' | 'operational';

const PAYMENT_METHODS = PM;

@Component({
  selector: 'app-settings-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPageComponent implements OnInit {
  protected readonly tab = signal<Tab>('parking');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);

  protected readonly paymentMethods = PAYMENT_METHODS;

  parkingForm!: FormGroup;
  invoicingForm!: FormGroup;
  operationalForm!: FormGroup;

  private readonly settingsForms = inject(SettingsForms);
  private readonly toast = inject(ToastService);

  constructor(
    @Inject(GET_SETTING_TOKEN) private readonly getSettingUC: GetSettingUseCase,
    @Inject(UPDATE_SETTING_TOKEN) private readonly updateSettingUC: UpdateSettingUseCase,
  ) {}

  ngOnInit(): void {
    this.parkingForm = this.settingsForms.createParkingInfoForm();
    this.invoicingForm = this.settingsForms.createInvoicingConfigForm();
    this.operationalForm = this.settingsForms.createOperationalConfigForm();
    void this.loadAll();
  }

  protected setTab(t: Tab): void {
    this.tab.set(t);
  }

  protected isMethodEnabled(method: string): boolean {
    const list = (this.operationalForm?.value.enabled_payment_methods ?? []) as string[];
    return list.includes(method);
  }

  protected toggleMethod(method: string, enabled: boolean): void {
    const list = (this.operationalForm.value.enabled_payment_methods ?? []) as string[];
    let next: string[];
    if (enabled && !list.includes(method)) {
      next = [...list, method];
    } else if (!enabled) {
      next = list.filter((m) => m !== method);
    } else {
      return;
    }
    this.operationalForm.patchValue({ enabled_payment_methods: next });
  }

  async saveParking(): Promise<void> {
    if (this.parkingForm.invalid) return;
    this.saving.set(true);
    const result = await this.updateSettingUC.execute({
      key: 'parking_info',
      value: this.parkingForm.value as ParkingInfoValue,
    });
    this.saving.set(false);
    result.fold(
      (f) => this.toast.error(`Error al guardar: ${f.message}`),
      () => this.toast.success('Datos del parqueadero actualizados'),
    );
  }

  async saveInvoicing(): Promise<void> {
    if (this.invoicingForm.invalid) return;
    this.saving.set(true);
    const result = await this.updateSettingUC.execute({
      key: 'invoicing_config',
      value: this.invoicingForm.value as InvoicingConfigValue,
    });
    this.saving.set(false);
    result.fold(
      (f) => this.toast.error(`Error al guardar: ${f.message}`),
      () => this.toast.success('Configuración de facturación actualizada'),
    );
  }

  async saveOperational(): Promise<void> {
    if (this.operationalForm.invalid) return;
    this.saving.set(true);
    const v = this.operationalForm.value as OperationalConfigValue;
    const result = await this.updateSettingUC.execute({
      key: 'operational_config',
      value: {
        ...v,
        cash_cap_cents: Number(v.cash_cap_cents),
        monthly_grace_days: Number(v.monthly_grace_days),
        max_courtesies_per_shift: Number(v.max_courtesies_per_shift),
      },
    });
    this.saving.set(false);
    result.fold(
      (f) => this.toast.error(`Error al guardar: ${f.message}`),
      () => this.toast.success('Configuración operativa actualizada'),
    );
  }

  private async loadAll(): Promise<void> {
    this.loading.set(true);
    const [pi, inv, op] = await Promise.all([
      this.getSettingUC.execute({ key: 'parking_info' }),
      this.getSettingUC.execute({ key: 'invoicing_config' }),
      this.getSettingUC.execute({ key: 'operational_config' }),
    ]);

    pi.fold(
      (f) => this.toast.error(`Error parking_info: ${f.message}`),
      (s) => {
        if (s) this.parkingForm.patchValue(s.value as ParkingInfoValue);
      },
    );
    inv.fold(
      (f) => this.toast.error(`Error invoicing_config: ${f.message}`),
      (s) => {
        if (s) this.invoicingForm.patchValue(s.value as InvoicingConfigValue);
      },
    );
    op.fold(
      (f) => this.toast.error(`Error operational_config: ${f.message}`),
      (s) => {
        if (s) this.operationalForm.patchValue(s.value as OperationalConfigValue);
      },
    );

    this.loading.set(false);
  }
}
