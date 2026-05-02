import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { AuthStateService } from '../../../../core/services/auth-state.service';
import {
  OPEN_SHIFT_TOKEN,
  CLOSE_SHIFT_TOKEN,
  RECONCILE_SHIFT_TOKEN,
  LIST_PAYMENTS_TOKEN,
  CASHIER_REPOSITORY_TOKEN,
  REGISTER_WITHDRAWAL_TOKEN,
} from '../../../../core/di/injection-tokens';
import { Dialog } from '@angular/cdk/dialog';
import {
  CashWithdrawalDialogComponent,
  WithdrawalFormValue,
} from '../components/cash-withdrawal-dialog.component';
import { RegisterCashWithdrawalUseCase } from '../../domain/usecases/register-withdrawal.usecase';
import { CashWithdrawalEntity } from '../../domain/entities/cash-withdrawal.entity';
import { OpenShiftUseCase } from '../../domain/usecases/open-shift.usecase';
import { CloseShiftUseCase } from '../../domain/usecases/close-shift.usecase';
import { ReconcileShiftUseCase, ReconcileResult } from '../../domain/usecases/reconcile-shift.usecase';
import { ListPaymentsUseCase } from '../../../payments/domain/usecases/list-payments.usecase';
import { CashierRepository } from '../../domain/repositories/cashier.repository';
import { CashierShiftEntity } from '../../domain/entities/cashier-shift.entity';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';
import { CashierForms } from '../forms/cashier.forms';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { ErrorDisplayComponent } from '../../../../shared/components/error-display/error-display.component';
import { ToastService } from '../../../../core/services/toast.service';
import { CurrencyInputDirective } from '../../../../shared/directives/currency-input.directive';

type PageView = 'loading' | 'no-shift' | 'open-shift';

@Component({
  selector: 'app-cashier-shift-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, LoadingSpinnerComponent, ErrorDisplayComponent, CurrencyInputDirective],
  templateUrl: './cashier-shift.page.html',
  styleUrl: './cashier-shift.page.scss',
})
export class CashierShiftPageComponent implements OnInit {
  view = signal<PageView>('loading');
  loading = signal(false);
  errorMsg = signal<string | null>(null);

  shift = signal<CashierShiftEntity | null>(null);
  reconcile = signal<ReconcileResult | null>(null);
  payments = signal<PaymentEntity[]>([]);
  withdrawals = signal<CashWithdrawalEntity[]>([]);

  // HU-036: conteo de efectivo por denominación. Cantidades, no totales.
  protected readonly denominationDefs = [
    { key: 'b100000', label: 'Billetes $100.000', value: 10_000_000 },
    { key: 'b50000',  label: 'Billetes $50.000',  value:  5_000_000 },
    { key: 'b20000',  label: 'Billetes $20.000',  value:  2_000_000 },
    { key: 'b10000',  label: 'Billetes $10.000',  value:  1_000_000 },
    { key: 'b5000',   label: 'Billetes $5.000',   value:    500_000 },
    { key: 'b2000',   label: 'Billetes $2.000',   value:    200_000 },
    { key: 'b1000',   label: 'Billetes $1.000',   value:    100_000 },
    { key: 'c1000',   label: 'Monedas $1.000',    value:    100_000 },
    { key: 'c500',    label: 'Monedas $500',      value:     50_000 },
    { key: 'c200',    label: 'Monedas $200',      value:     20_000 },
    { key: 'c100',    label: 'Monedas $100',      value:     10_000 },
    { key: 'c50',     label: 'Monedas $50',       value:      5_000 },
  ];
  protected readonly denominationCounts = signal<Record<string, number>>({});
  protected readonly showDenominationGrid = signal(false);
  protected readonly denominationTotalCents = computed(() => {
    const counts = this.denominationCounts();
    return this.denominationDefs.reduce(
      (acc, d) => acc + (counts[d.key] ?? 0) * d.value,
      0,
    );
  });

  openForm!: FormGroup;
  closeForm!: FormGroup;

  differenceDisplay = computed<number | null>(() => {
    const closing = this.closeForm?.get('closingBalanceCents')?.value;
    const rec = this.reconcile();
    if (closing === null || closing === undefined || closing === '' || !rec) return null;
    return Number(closing) - rec.cashExpectedCents;
  });

  showJustification = computed(() => {
    const diff = this.differenceDisplay();
    return diff !== null && Math.abs(diff) > 500_000;
  });

  isDiffLarge = computed(() => {
    const diff = this.differenceDisplay();
    return diff !== null && Math.abs(diff) > 500_000;
  });

  constructor(
    private readonly auth: AuthStateService,
    private readonly cashierForms: CashierForms,
    @Inject(CASHIER_REPOSITORY_TOKEN) private readonly cashierRepo: CashierRepository,
    @Inject(OPEN_SHIFT_TOKEN) private readonly openShiftUC: OpenShiftUseCase,
    @Inject(CLOSE_SHIFT_TOKEN) private readonly closeShiftUC: CloseShiftUseCase,
    @Inject(RECONCILE_SHIFT_TOKEN) private readonly reconcileUC: ReconcileShiftUseCase,
    @Inject(LIST_PAYMENTS_TOKEN) private readonly listPaymentsUC: ListPaymentsUseCase,
    @Inject(REGISTER_WITHDRAWAL_TOKEN) private readonly registerWithdrawalUC: RegisterCashWithdrawalUseCase,
    private readonly toast: ToastService,
    private readonly dialog: Dialog,
  ) {}

  ngOnInit(): void {
    this.openForm = this.cashierForms.createOpenShiftForm();
    this.closeForm = this.cashierForms.createCloseShiftForm();
    this.loadShiftState();
  }

  protected methodLabel(method: string): string {
    const map: Record<string, string> = {
      efectivo: 'Efectivo',
      tarjeta_credito: 'Tarjeta crédito',
      tarjeta_debito: 'Tarjeta débito',
      transferencia: 'Transferencia',
      nequi: 'Nequi',
      daviplata: 'Daviplata',
      cortesia: 'Cortesía',
      error: 'Error',
      mensual: 'Plan mensual',
    };
    return map[method] ?? method;
  }

  protected shortId(id: string): string {
    return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
  }

  private async loadShiftState(): Promise<void> {
    try {
      const userId = this.auth.currentUser()?.id;
      if (!userId) {
        this.view.set('no-shift');
        return;
      }

      const result = await this.cashierRepo.findOpenByUser(userId);
      result.fold(
        (f) => {
          this.toast.error(`No se pudo verificar el turno: ${f.message}`);
          this.view.set('no-shift');
        },
        (shift) => {
          if (shift) {
            this.shift.set(shift);
            this.view.set('open-shift');
            void this.loadShiftData(shift.id);
          } else {
            this.view.set('no-shift');
          }
        },
      );
    } catch (err) {
      console.error('[CashierShift] loadShiftState error:', err);
      this.toast.error('Error inesperado al cargar el estado del turno');
      this.view.set('no-shift');
    }
  }

  private async loadShiftData(shiftId: string): Promise<void> {
    const [reconcileRes, paymentsRes, withdrawalsRes] = await Promise.all([
      this.reconcileUC.execute({ shiftId }),
      this.listPaymentsUC.execute({ shiftId, page: 1, pageSize: 100 }),
      this.cashierRepo.listWithdrawalsByShift(shiftId),
    ]);

    reconcileRes.fold(
      (f) => {
        this.errorMsg.set(f.message);
        this.toast.error(`Error al cuadrar caja: ${f.message}`);
      },
      (r) => this.reconcile.set(r),
    );

    paymentsRes.fold(
      (f) => {
        this.errorMsg.set(f.message);
        this.toast.error(`Error al listar pagos: ${f.message}`);
      },
      (r) => this.payments.set(r.data),
    );

    withdrawalsRes.fold(
      () => {
        // El historial de retiros es informativo: si falla seguimos sin él.
        this.withdrawals.set([]);
      },
      (list) => this.withdrawals.set(list),
    );
  }

  // HU-036: actualizar la cantidad de una denominación y aplicar el total
  // automáticamente al campo closingBalanceCents.
  protected onDenominationChange(key: string, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
    this.denominationCounts.update((c) => ({ ...c, [key]: value }));
    this.closeForm.get('closingBalanceCents')!.setValue(this.denominationTotalCents());
  }

  protected toggleDenominationGrid(): void {
    this.showDenominationGrid.update((v) => !v);
  }

  protected openWithdrawalDialog(): void {
    const shift = this.shift();
    const userId = this.auth.currentUser()?.id;
    if (!shift || !userId) return;

    const ref = this.dialog.open<WithdrawalFormValue | undefined>(CashWithdrawalDialogComponent, {});
    ref.closed.subscribe(async (value) => {
      if (!value) return;
      const result = await this.registerWithdrawalUC.execute({
        shiftId: shift.id,
        userId,
        amountCents: value.amountCents,
        recipient: value.recipient,
        justification: value.justification,
      });
      result.fold(
        (f) => this.toast.error(`No se pudo registrar el retiro: ${f.message}`),
        () => {
          this.toast.success(`Retiro de $${value.amountCents.toLocaleString('es-CO')} registrado`);
          void this.loadShiftData(shift.id);
        },
      );
    });
  }

  async openShift(): Promise<void> {
    if (this.openForm.invalid) return;
    this.loading.set(true);
    this.errorMsg.set(null);

    const userId = this.auth.currentUser()?.id ?? '';
    const openingBalanceCents = Number(this.openForm.value.openingBalanceCents ?? 0);

    const result = await this.openShiftUC.execute({ userId, openingBalanceCents });

    result.fold(
      (f) => {
        this.errorMsg.set(f.message);
        this.toast.error(f.message);
        this.loading.set(false);
      },
      (shift) => {
        this.shift.set(shift);
        this.view.set('open-shift');
        this.loading.set(false);
        this.toast.success(`Turno abierto con saldo de $${(openingBalanceCents).toLocaleString('es-CO')}`);
        this.loadShiftData(shift.id);
      },
    );
  }

  async closeShift(): Promise<void> {
    if (this.closeForm.invalid) return;
    const shift = this.shift();
    if (!shift) return;

    this.loading.set(true);
    this.errorMsg.set(null);

    const userId = this.auth.currentUser()?.id ?? '';
    const closingBalanceCents = Number(this.closeForm.value.closingBalanceCents);
    const justification = (this.closeForm.value.justification as string)?.trim() || null;

    const result = await this.closeShiftUC.execute({
      shiftId: shift.id,
      userId,
      closingBalanceCents,
      justification,
    });

    result.fold(
      (f) => {
        this.errorMsg.set(f.message);
        this.toast.error(f.message);
        this.loading.set(false);
      },
      () => {
        this.shift.set(null);
        this.view.set('no-shift');
        this.loading.set(false);
        this.openForm.reset({ openingBalanceCents: 0 });
        this.closeForm.reset();
        this.toast.success('Turno cerrado correctamente');
      },
    );
  }
}
