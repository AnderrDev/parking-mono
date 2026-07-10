import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  Inject,
  OnInit,
  ViewContainerRef,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { AuthStateService } from '../../../../core/services/auth-state.service';
import {
  OPEN_SHIFT_TOKEN,
  CORRECT_OPENING_BALANCE_TOKEN,
  CLOSE_SHIFT_TOKEN,
  RECONCILE_SHIFT_TOKEN,
  LIST_PAYMENTS_TOKEN,
  CORRECT_PAYMENT_METHOD_TOKEN,
  CASHIER_REPOSITORY_TOKEN,
  REGISTER_WITHDRAWAL_TOKEN,
  VOID_PAYMENT_TOKEN,
} from '../../../../core/di/injection-tokens';
import { Dialog } from '@angular/cdk/dialog';
import {
  CashWithdrawalDialogComponent,
  WithdrawalFormValue,
} from '../components/cash-withdrawal-dialog.component';
import {
  CorrectOpeningBalanceDialogComponent,
  CorrectOpeningBalanceDialogData,
  CorrectOpeningBalanceDialogResult,
} from '../components/correct-opening-balance-dialog.component';
import {
  CorrectPaymentMethodDialogComponent,
  CorrectPaymentMethodDialogData,
  CorrectPaymentMethodDialogResult,
} from '../components/correct-payment-method-dialog.component';
import {
  CloseShiftSummaryDialogComponent,
  CloseShiftSummaryDialogData,
  CloseShiftSummaryDialogResult,
} from '../components/close-shift-summary-dialog.component';
import {
  paymentChannel,
  paymentMethodLabel,
} from '../../../../shared/utils/payment-method.utils';
import { RegisterCashWithdrawalUseCase } from '../../domain/usecases/register-withdrawal.usecase';
import { CashWithdrawalEntity } from '../../domain/entities/cash-withdrawal.entity';
import { OpenShiftUseCase } from '../../domain/usecases/open-shift.usecase';
import { CorrectOpeningBalanceUseCase } from '../../domain/usecases/correct-opening-balance.usecase';
import { CloseShiftUseCase } from '../../domain/usecases/close-shift.usecase';
import { ReconcileShiftUseCase, ReconcileResult } from '../../domain/usecases/reconcile-shift.usecase';
import { ListPaymentsUseCase } from '../../../payments/domain/usecases/list-payments.usecase';
import { CorrectPaymentMethodUseCase } from '../../../payments/domain/usecases/correct-payment-method.usecase';
import { VoidPaymentUseCase } from '../../../payments/domain/usecases/void-payment.usecase';
import { CashierRepository } from '../../domain/repositories/cashier.repository';
import { CashierShiftEntity } from '../../domain/entities/cashier-shift.entity';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';
import { CashierForms } from '../forms/cashier.forms';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { ErrorDisplayComponent } from '../../../../shared/components/error-display/error-display.component';
import { ToastService } from '../../../../core/services/toast.service';
import { CurrencyInputDirective } from '../../../../shared/directives/currency-input.directive';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { TicketRendererService } from '../../../parking/data/services/ticket-renderer.service';

type PageView = 'loading' | 'no-shift' | 'open-shift';

interface ShiftPaymentRow {
  payment: PaymentEntity;
  plate: string | null;
  vehicleType: VehicleType | null;
  entryAt: Date | null;
  exitAt: Date | null;
}

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
  openingDrawer = signal(false);
  errorMsg = signal<string | null>(null);

  shift = signal<CashierShiftEntity | null>(null);
  reconcile = signal<ReconcileResult | null>(null);
  payments = signal<PaymentEntity[]>([]);
  paymentRows = signal<ShiftPaymentRow[]>([]);
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

  // Espejo reactivo de los campos del form de cierre: los `computed` de
  // signals no rastrean lecturas de FormControl.value.
  private readonly closingValue = signal<number | null>(null);
  private readonly digitalVerifiedValue = signal<number | null>(null);

  differenceDisplay = computed<number | null>(() => {
    const closing = this.closingValue();
    const rec = this.reconcile();
    if (closing === null || !rec) return null;
    return closing - rec.cashExpectedCents;
  });

  /** Diferencia digital en vivo (verificado − recibido); null si no digitó. */
  digitalDifferenceDisplay = computed<number | null>(() => {
    const verified = this.digitalVerifiedValue();
    const rec = this.reconcile();
    if (verified === null || !rec) return null;
    return verified - rec.digitalCollectedCents;
  });

  showJustification = computed(() => {
    const diff = this.differenceDisplay();
    return diff !== null && diff !== 0;
  });

  isDiffLarge = computed(() => {
    const diff = this.differenceDisplay();
    return diff !== null && Math.abs(diff) > 500_000;
  });

  /** Justificación obligatoria por spec cuando |diferencia efectivo| > $5.000. */
  justificationRequired = computed(() => this.isDiffLarge());

  // Breakdown por canal para la card "Cuadre actual" (spec reconcile).
  cashRows = computed(() =>
    (this.reconcile()?.byMethod ?? []).filter((r) => paymentChannel(r.method) === 'cash'),
  );
  digitalRows = computed(() =>
    (this.reconcile()?.byMethod ?? []).filter((r) => paymentChannel(r.method) === 'digital'),
  );
  freeRows = computed(() =>
    (this.reconcile()?.byMethod ?? []).filter((r) => paymentChannel(r.method) === 'free'),
  );

  constructor(
    private readonly auth: AuthStateService,
    private readonly cashierForms: CashierForms,
    @Inject(CASHIER_REPOSITORY_TOKEN) private readonly cashierRepo: CashierRepository,
    @Inject(OPEN_SHIFT_TOKEN) private readonly openShiftUC: OpenShiftUseCase,
    @Inject(CORRECT_OPENING_BALANCE_TOKEN) private readonly correctOpeningBalanceUC: CorrectOpeningBalanceUseCase,
    @Inject(CLOSE_SHIFT_TOKEN) private readonly closeShiftUC: CloseShiftUseCase,
    @Inject(RECONCILE_SHIFT_TOKEN) private readonly reconcileUC: ReconcileShiftUseCase,
    @Inject(LIST_PAYMENTS_TOKEN) private readonly listPaymentsUC: ListPaymentsUseCase,
    @Inject(CORRECT_PAYMENT_METHOD_TOKEN) private readonly correctPaymentMethodUC: CorrectPaymentMethodUseCase,
    @Inject(VOID_PAYMENT_TOKEN) private readonly voidPaymentUC: VoidPaymentUseCase,
    @Inject(REGISTER_WITHDRAWAL_TOKEN) private readonly registerWithdrawalUC: RegisterCashWithdrawalUseCase,
    private readonly toast: ToastService,
    private readonly supabase: SupabaseService,
    private readonly ticketPrinter: TicketRendererService,
    private readonly dialog: Dialog,
    /** Anclar overlay del dialog. */
    private readonly vcr: ViewContainerRef,
  ) {}

  /** EnvironmentInjector del route para que el dialog vea providers route-scoped (ver operator-dashboard.page.ts). */
  private readonly envInjector = inject(EnvironmentInjector);

  ngOnInit(): void {
    this.openForm = this.cashierForms.createOpenShiftForm();
    this.closeForm = this.cashierForms.createCloseShiftForm();

    this.closeForm.get('closingBalanceCents')!.valueChanges.subscribe((v) => {
      this.closingValue.set(v === null || v === undefined || v === '' ? null : Number(v));
    });
    this.closeForm.get('digitalVerifiedCents')!.valueChanges.subscribe((v) => {
      this.digitalVerifiedValue.set(v === null || v === undefined || v === '' ? null : Number(v));
    });

    this.loadShiftState();
  }

  protected methodLabel(method: string): string {
    return paymentMethodLabel(method);
  }

  protected shortId(id: string | null): string {
    if (!id) return '—';
    return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
  }

  private async loadShiftState(): Promise<void> {
    try {
      const userId = this.auth.currentUser()?.id;
      if (!userId) {
        this.view.set('no-shift');
        return;
      }

      const result = await this.cashierRepo.findOpen();
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
      (r) => {
        this.payments.set(r.data);
        void this.hydratePaymentRows(r.data);
      },
    );

    withdrawalsRes.fold(
      () => {
        // El historial de retiros es informativo: si falla seguimos sin él.
        this.withdrawals.set([]);
      },
      (list) => this.withdrawals.set(list),
    );
  }

  private async hydratePaymentRows(payments: PaymentEntity[]): Promise<void> {
    const sessionIds = payments
      .map((p) => p.sessionId)
      .filter((id): id is string => Boolean(id));

    if (!sessionIds.length) {
      this.paymentRows.set(payments.map((payment) => ({
        payment,
        plate: null,
        vehicleType: null,
        entryAt: null,
        exitAt: null,
      })));
      return;
    }

    const { data, error } = await this.supabase.client
      .from('parking_sessions')
      .select('id, vehicle_plate, vehicle_type, entry_at, exit_at')
      .in('id', sessionIds);

    if (error) {
      this.paymentRows.set(payments.map((payment) => ({
        payment,
        plate: null,
        vehicleType: null,
        entryAt: null,
        exitAt: null,
      })));
      return;
    }

    const sessions = new Map((data ?? []).map((row) => [row.id as string, row]));
    this.paymentRows.set(payments.map((payment) => {
      const session = payment.sessionId ? sessions.get(payment.sessionId) : null;
      return {
        payment,
        plate: (session?.vehicle_plate as string | undefined) ?? null,
        vehicleType: (session?.vehicle_type as VehicleType | undefined) ?? null,
        entryAt: session?.entry_at ? new Date(session.entry_at as string) : null,
        exitAt: session?.exit_at ? new Date(session.exit_at as string) : null,
      };
    }));
  }

  protected statusLabel(status: string): string {
    const map: Record<string, string> = {
      completed: 'Completado',
      pending: 'Pendiente',
      refunded: 'Anulado',
    };
    return map[status] ?? status;
  }

  protected async voidPayment(row: ShiftPaymentRow): Promise<void> {
    if (row.payment.status !== 'completed') return;
    const reason = window.prompt(
      `Motivo de anulación para ${row.plate ?? this.shortId(row.payment.id)}:`,
      '',
    )?.trim();
    if (!reason) return;

    const result = await this.voidPaymentUC.execute({
      paymentId: row.payment.id,
      reason,
    });

    result.fold(
      (f) => this.toast.error(`No se pudo anular: ${f.message}`),
      () => {
        this.toast.success('Movimiento anulado y caja recalculada');
        const shift = this.shift();
        if (shift) void this.loadShiftData(shift.id);
      },
    );
  }

  protected editPaymentMethod(row: ShiftPaymentRow): void {
    if (row.payment.status !== 'completed' || row.payment.amountCents <= 0) return;

    const ref = this.dialog.open<
      CorrectPaymentMethodDialogResult | undefined,
      CorrectPaymentMethodDialogData
    >(CorrectPaymentMethodDialogComponent, {
      injector: this.envInjector,
      viewContainerRef: this.vcr,
      data: {
        currentMethod: row.payment.method,
        label: row.plate ?? this.shortId(row.payment.id),
      },
      ariaLabelledBy: 'correct-payment-method-title',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      hasBackdrop: true,
    });

    ref.closed.subscribe((value) => {
      if (!value || value.method === row.payment.method) return;
      void this.correctPaymentMethod(row.payment.id, value.method);
    });
  }

  private async correctPaymentMethod(paymentId: string, method: PaymentEntity['method']): Promise<void> {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return;

    this.loading.set(true);
    const result = await this.correctPaymentMethodUC.execute({ paymentId, method, userId });
    this.loading.set(false);

    result.fold(
      (f) => this.toast.error(`No se pudo corregir pago: ${f.message}`),
      () => {
        this.toast.success('Método de pago corregido');
        const shift = this.shift();
        if (shift) void this.loadShiftData(shift.id);
      },
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

    const ref = this.dialog.open<WithdrawalFormValue | undefined>(CashWithdrawalDialogComponent, {
      injector: this.envInjector,
      viewContainerRef: this.vcr,
    });
    ref.closed.subscribe(async (value) => {
      if (!value) return;
      const result = await this.registerWithdrawalUC.execute({
        shiftId: shift.id,
        userId,
        amountCents: value.amountCents,
        recipient: value.recipient,
        justification: value.justification,
        movementType: value.movementType,
      });
      result.fold(
        (f) => this.toast.error(`No se pudo registrar el movimiento: ${f.message}`),
        () => {
          const label = value.movementType === 'in' ? 'Entrada' : 'Salida';
          this.toast.success(`${label} de $${Math.round(value.amountCents / 100).toLocaleString('es-CO')} registrada`);
          void this.loadShiftData(shift.id);
        },
      );
    });
  }

  protected openCorrectOpeningBalanceDialog(): void {
    const shift = this.shift();
    if (!shift) return;

    const ref = this.dialog.open<
      CorrectOpeningBalanceDialogResult | undefined,
      CorrectOpeningBalanceDialogData
    >(CorrectOpeningBalanceDialogComponent, {
      injector: this.envInjector,
      viewContainerRef: this.vcr,
      data: { currentBalanceCents: shift.openingBalanceCents },
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      hasBackdrop: true,
    });

    ref.closed.subscribe((value) => {
      if (!value || value.openingBalanceCents === shift.openingBalanceCents) return;
      void this.correctOpeningBalance(value.openingBalanceCents);
    });
  }

  private async correctOpeningBalance(openingBalanceCents: number): Promise<void> {
    const shift = this.shift();
    const userId = this.auth.currentUser()?.id;
    if (!shift || !userId) return;

    this.loading.set(true);
    const result = await this.correctOpeningBalanceUC.execute({
      shiftId: shift.id,
      userId,
      openingBalanceCents,
    });
    this.loading.set(false);

    result.fold(
      (f) => this.toast.error(`No se pudo corregir apertura: ${f.message}`),
      (updated) => {
        this.shift.set(updated);
        this.toast.success('Saldo de apertura corregido');
        void this.loadShiftData(updated.id);
      },
    );
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
        this.toast.success(`Turno abierto con saldo de $${Math.round(openingBalanceCents / 100).toLocaleString('es-CO')}`);
        this.loadShiftData(shift.id);
      },
    );
  }

  async openCashDrawer(): Promise<void> {
    if (this.openingDrawer()) return;

    this.ticketPrinter.invalidateCache();
    this.openingDrawer.set(true);
    try {
      const result = await this.ticketPrinter.openCashDrawer();
      if (result.ok) {
        this.toast.success('Pulso enviado a la caja monedero');
      } else {
        this.toast.error(result.message ?? 'No se pudo abrir la caja monedero');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo abrir la caja monedero';
      this.toast.error(message);
    } finally {
      this.openingDrawer.set(false);
    }
  }

  /**
   * Abre el modal "Resumen de cierre" (spec close-shift). El cierre real solo
   * se ejecuta al confirmar dentro del modal; los errores del backend se
   * muestran inline sin cerrarlo.
   */
  closeShift(): void {
    if (this.closeForm.invalid) return;
    const shift = this.shift();
    const rec = this.reconcile();
    if (!shift || !rec) return;

    this.errorMsg.set(null);

    const closingBalanceCents = Number(this.closeForm.value.closingBalanceCents);
    const rawVerified = this.closeForm.value.digitalVerifiedCents;
    const digitalVerifiedCents =
      rawVerified === null || rawVerified === undefined || rawVerified === ''
        ? null
        : Number(rawVerified);
    const justification = (this.closeForm.value.justification as string)?.trim() || null;

    // Regla spec: |diferencia efectivo| > $5.000 exige justificación. Se valida
    // antes de abrir el modal para que el operador corrija sin perder contexto.
    const difference = closingBalanceCents - rec.cashExpectedCents;
    if (Math.abs(difference) > 500_000 && !justification) {
      this.errorMsg.set('La diferencia supera $5.000. Ingresa una justificación.');
      return;
    }

    const userId = this.auth.currentUser()?.id ?? '';
    const data: CloseShiftSummaryDialogData = {
      openingBalanceCents: shift.openingBalanceCents,
      byMethod: rec.byMethod,
      cashCollectedCents: rec.cashCollectedCents,
      manualIncomeCents: rec.manualIncomeCents,
      withdrawalsTotalCents: rec.withdrawalsTotalCents,
      cashExpectedCents: rec.cashExpectedCents,
      cashCountedCents: closingBalanceCents,
      digitalCollectedCents: rec.digitalCollectedCents,
      digitalVerifiedCents,
      totalRevenueCents: rec.totalRevenueCents,
      totalSessions: rec.totalSessions,
      justification,
      onConfirm: () =>
        this.closeShiftUC.execute({
          shiftId: shift.id,
          userId,
          closingBalanceCents,
          digitalVerifiedCents,
          justification,
        }),
    };

    const ref = this.dialog.open<CloseShiftSummaryDialogResult, CloseShiftSummaryDialogData>(
      CloseShiftSummaryDialogComponent,
      {
        injector: this.envInjector,
        viewContainerRef: this.vcr,
        data,
        ariaLabelledBy: 'close-shift-summary-title',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
        hasBackdrop: true,
        disableClose: true,
      },
    );

    ref.closed.subscribe((result) => {
      if (result !== 'closed') return;

      this.shift.set(null);
      this.reconcile.set(null);
      this.view.set('no-shift');
      this.openForm.reset({ openingBalanceCents: 0 });
      this.closeForm.reset();
      this.closingValue.set(null);
      this.digitalVerifiedValue.set(null);
      this.denominationCounts.set({});
      this.showDenominationGrid.set(false);

      const sign = difference > 0 ? '+' : difference < 0 ? '−' : '';
      const diffLabel =
        difference === 0
          ? 'caja cuadrada'
          : `diferencia efectivo ${sign}$${Math.round(Math.abs(difference) / 100).toLocaleString('es-CO')}`;
      this.toast.success(`Caja cerrada — ${diffLabel}`);
    });
  }
}
