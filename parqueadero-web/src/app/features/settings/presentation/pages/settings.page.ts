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
import { CurrencyInputDirective } from '../../../../shared/directives/currency-input.directive';
import { GetSettingUseCase } from '../../domain/usecases/get-setting.usecase';
import { UpdateSettingUseCase } from '../../domain/usecases/update-setting.usecase';
import {
  OperationalConfigValue,
  ParkingInfoValue,
} from '../../domain/entities/app-setting.entity';
import { ToastService } from '../../../../core/services/toast.service';
import {
  ParkingInfo,
  TicketRendererService,
} from '../../../parking/data/services/ticket-renderer.service';
import { QzParkingPrinterDiagnostic } from '../../../parking/data/services/qz-parking-printer.service';

type Tab = 'parking' | 'operational';

const PAYMENT_METHODS = PM;

@Component({
  selector: 'app-settings-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, CurrencyInputDirective],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPageComponent implements OnInit {
  protected readonly tab = signal<Tab>('parking');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly testingPrinter = signal(false);
  protected readonly openingDrawer = signal(false);
  protected readonly diagnosingPrinter = signal(false);
  protected readonly printerDiagnostic = signal<QzParkingPrinterDiagnostic | null>(null);

  protected readonly paymentMethods = PAYMENT_METHODS;

  parkingForm!: FormGroup;
  operationalForm!: FormGroup;

  private readonly settingsForms = inject(SettingsForms);
  private readonly toast = inject(ToastService);
  private readonly ticketPrinter = inject(TicketRendererService);

  constructor(
    @Inject(GET_SETTING_TOKEN) private readonly getSettingUC: GetSettingUseCase,
    @Inject(UPDATE_SETTING_TOKEN) private readonly updateSettingUC: UpdateSettingUseCase,
  ) {}

  ngOnInit(): void {
    this.parkingForm = this.settingsForms.createParkingInfoForm();
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

  async saveParking(): Promise<boolean> {
    if (this.parkingForm.invalid) return false;
    this.saving.set(true);
    const result = await this.updateSettingUC.execute({
      key: 'parking_info',
      value: this.parkingForm.value as ParkingInfoValue,
    });
    this.saving.set(false);
    return result.fold(
      (f) => {
        this.toast.error(`Error al guardar: ${f.message}`);
        return false;
      },
      () => {
        this.toast.success('Datos del parqueadero actualizados');
        return true;
      },
    );
  }

  async printTestReceipt(): Promise<void> {
    if (this.parkingForm.invalid || this.testingPrinter()) return;
    this.ticketPrinter.invalidateCache();
    this.testingPrinter.set(true);
    const result = await this.ticketPrinter.printTestReceipt(this.parkingInfoFromForm());
    this.testingPrinter.set(false);
    if (result.ok) this.toast.success('Prueba enviada a la impresora');
    else this.toast.error(result.message ?? 'No se pudo imprimir la prueba');
  }

  async openCashDrawer(): Promise<void> {
    if (this.parkingForm.invalid || this.openingDrawer()) return;
    this.ticketPrinter.invalidateCache();
    this.openingDrawer.set(true);
    const result = await this.ticketPrinter.openCashDrawer(this.parkingInfoFromForm());
    this.openingDrawer.set(false);
    if (result.ok) this.toast.success('Pulso enviado a la caja monedero');
    else this.toast.error(result.message ?? 'No se pudo abrir la caja monedero');
  }

  async diagnosePrinter(): Promise<void> {
    if (this.parkingForm.invalid || this.diagnosingPrinter()) return;
    this.ticketPrinter.invalidateCache();
    this.diagnosingPrinter.set(true);
    this.printerDiagnostic.set(null);
    try {
      const diagnostic = await this.ticketPrinter.diagnosePrinter(this.parkingInfoFromForm());
      this.printerDiagnostic.set(diagnostic);
      if (diagnostic.selectedPrinterName) {
        this.toast.success(`QZ detectó la impresora ${diagnostic.selectedPrinterName}`);
      } else {
        this.toast.warning('QZ conectó, pero no pudo seleccionar una impresora');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.toast.error(message);
    } finally {
      this.diagnosingPrinter.set(false);
    }
  }

  private parkingInfoFromForm(): ParkingInfo {
    const value = this.parkingForm.value as ParkingInfoValue;
    return {
      name: value.name?.trim() || 'Parqueadero',
      nit: value.nit ?? '',
      dv: value.dv ?? '',
      address: value.address ?? '',
      phone: value.phone ?? '',
      parkingType: value.parkingType ?? '',
      resolutionNumber: value.resolutionNumber ?? '',
      closingTime: value.closingTime ?? '',
      printerName: '',
      printEntryTicketEnabled: value.printEntryTicketEnabled ?? true,
      printExitReceiptEnabled: value.printExitReceiptEnabled ?? true,
      openDrawerOnCashPayment: value.openDrawerOnCashPayment ?? false,
    };
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
    const [pi, op] = await Promise.all([
      this.getSettingUC.execute({ key: 'parking_info' }),
      this.getSettingUC.execute({ key: 'operational_config' }),
    ]);

    pi.fold(
      (f) => this.toast.error(`Error parking_info: ${f.message}`),
      (s) => {
        if (s) {
          const parkingInfo = s.value as ParkingInfoValue;
          this.parkingForm.patchValue({
            printEntryTicketEnabled: true,
            printExitReceiptEnabled: true,
            openDrawerOnCashPayment: false,
            ...parkingInfo,
            printerName: '',
          });
        }
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
