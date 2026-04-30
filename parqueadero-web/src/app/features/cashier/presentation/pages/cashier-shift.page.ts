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
} from '../../../../core/di/injection-tokens';
import { OpenShiftUseCase } from '../../domain/usecases/open-shift.usecase';
import { CloseShiftUseCase } from '../../domain/usecases/close-shift.usecase';
import { ReconcileShiftUseCase, ReconcileResult } from '../../domain/usecases/reconcile-shift.usecase';
import { ListPaymentsUseCase } from '../../../payments/domain/usecases/list-payments.usecase';
import { CashierRepository } from '../../domain/repositories/cashier.repository';
import { CashierShiftEntity } from '../../domain/entities/cashier-shift.entity';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';
import { CashierForms } from '../forms/cashier.forms';

type PageView = 'loading' | 'no-shift' | 'open-shift';

@Component({
  selector: 'app-cashier-shift-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="cashier-page">
      <header class="cashier-page__header">
        <h1>Caja</h1>
      </header>

      @if (view() === 'loading') {
        <div class="cashier-page__loading">Cargando estado de turno…</div>
      }

      @if (view() === 'no-shift') {
        <section class="cashier-card">
          <h2>Abrir turno</h2>
          <form [formGroup]="openForm" (ngSubmit)="openShift()">
            <label>
              Saldo inicial (COP)
              <input type="number" formControlName="openingBalanceCents" min="0" step="100" />
            </label>
            @if (errorMsg()) {
              <p class="cashier-card__error">{{ errorMsg() }}</p>
            }
            <button type="submit" [disabled]="openForm.invalid || loading()">
              {{ loading() ? 'Abriendo…' : 'Abrir turno' }}
            </button>
          </form>
        </section>
      }

      @if (view() === 'open-shift') {
        <div class="cashier-layout">
          <!-- Reconcile panel -->
          <section class="cashier-card cashier-card--reconcile">
            <h2>Cuadre en tiempo real</h2>
            @if (reconcile()) {
              <table class="reconcile-table">
                <thead>
                  <tr><th>Método</th><th>Tx</th><th>Total</th></tr>
                </thead>
                <tbody>
                  @for (row of reconcile()!.byMethod; track row.method) {
                    <tr>
                      <td>{{ row.method }}</td>
                      <td>{{ row.count }}</td>
                      <td>{{ row.amountCents / 100 | currency:'COP':'symbol-narrow':'1.0-0' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
              <div class="reconcile-summary">
                <span>Total recaudado:</span>
                <strong>{{ reconcile()!.totalRevenueCents / 100 | currency:'COP':'symbol-narrow':'1.0-0' }}</strong>
              </div>
              <div class="reconcile-summary">
                <span>Efectivo esperado:</span>
                <strong>{{ reconcile()!.cashExpectedCents / 100 | currency:'COP':'symbol-narrow':'1.0-0' }}</strong>
              </div>
            }
          </section>

          <!-- Payments list -->
          <section class="cashier-card cashier-card--payments">
            <h2>Pagos del turno</h2>
            @if (payments().length === 0) {
              <p class="cashier-card__empty">Sin pagos aún.</p>
            } @else {
              <table class="payments-table">
                <thead>
                  <tr><th>Hora</th><th>Placa</th><th>Método</th><th>Monto</th></tr>
                </thead>
                <tbody>
                  @for (p of payments(); track p.id) {
                    <tr>
                      <td>{{ p.paidAt | date:'HH:mm' }}</td>
                      <td>{{ p.sessionId }}</td>
                      <td>{{ p.method }}</td>
                      <td>{{ p.amountCents / 100 | currency:'COP':'symbol-narrow':'1.0-0' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </section>

          <!-- Close shift -->
          <section class="cashier-card cashier-card--close">
            <h2>Cerrar turno</h2>
            <form [formGroup]="closeForm" (ngSubmit)="closeShift()">
              <label>
                Efectivo contado (COP)
                <input type="number" formControlName="closingBalanceCents" min="0" step="100" />
              </label>
              @if (showJustification()) {
                <label>
                  Justificación (diferencia supera $5.000)
                  <textarea formControlName="justification" rows="3"></textarea>
                </label>
              }
              @if (differenceDisplay() !== null) {
                <p class="reconcile-diff" [class.reconcile-diff--alert]="isDiffLarge()">
                  Diferencia: {{ differenceDisplay()! / 100 | currency:'COP':'symbol-narrow':'1.0-0' }}
                </p>
              }
              @if (errorMsg()) {
                <p class="cashier-card__error">{{ errorMsg() }}</p>
              }
              <button type="submit" class="btn-close-shift" [disabled]="closeForm.invalid || loading()">
                {{ loading() ? 'Cerrando…' : 'Cerrar turno' }}
              </button>
            </form>
          </section>
        </div>
      }
    </div>
  `,
  styles: [`
    .cashier-page { padding: 1.5rem; }
    .cashier-page__header h1 { margin: 0 0 1.5rem; font-size: 1.5rem; }
    .cashier-layout { display: grid; gap: 1.5rem; grid-template-columns: 1fr 2fr 1fr; }
    .cashier-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1.25rem; }
    .cashier-card h2 { margin: 0 0 1rem; font-size: 1rem; font-weight: 600; }
    .cashier-card__error { color: #dc2626; font-size: .875rem; margin: .5rem 0; }
    .cashier-card__empty { color: #6b7280; font-size: .875rem; }
    .reconcile-table, .payments-table { width: 100%; border-collapse: collapse; font-size: .875rem; }
    .reconcile-table th, .payments-table th { text-align: left; border-bottom: 1px solid #e5e7eb; padding: .5rem .25rem; font-weight: 600; }
    .reconcile-table td, .payments-table td { padding: .4rem .25rem; }
    .reconcile-summary { display: flex; justify-content: space-between; margin-top: .75rem; font-size: .875rem; }
    .reconcile-diff { margin-top: .75rem; font-size: .875rem; }
    .reconcile-diff--alert { color: #dc2626; font-weight: 600; }
    label { display: block; font-size: .875rem; margin-bottom: .75rem; }
    input, textarea { display: block; width: 100%; margin-top: .25rem; border: 1px solid #d1d5db; border-radius: 6px; padding: .5rem; font-size: .875rem; }
    button { padding: .5rem 1rem; border-radius: 6px; border: none; cursor: pointer; font-size: .875rem; }
    button[type=submit] { background: #2563eb; color: #fff; width: 100%; margin-top: .5rem; }
    button[disabled] { opacity: .5; cursor: not-allowed; }
    .btn-close-shift { background: #dc2626; }
    .cashier-page__loading { color: #6b7280; }
  `],
})
export class CashierShiftPageComponent implements OnInit {
  view = signal<PageView>('loading');
  loading = signal(false);
  errorMsg = signal<string | null>(null);

  shift = signal<CashierShiftEntity | null>(null);
  reconcile = signal<ReconcileResult | null>(null);
  payments = signal<PaymentEntity[]>([]);

  openForm!: FormGroup;
  closeForm!: FormGroup;

  differenceDisplay = computed<number | null>(() => {
    const closing = this.closeForm?.get('closingBalanceCents')?.value;
    const rec = this.reconcile();
    if (closing === null || closing === undefined || !rec) return null;
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
  ) {}

  ngOnInit(): void {
    this.openForm = this.cashierForms.createOpenShiftForm();
    this.closeForm = this.cashierForms.createCloseShiftForm();
    this.loadShiftState();
  }

  private async loadShiftState(): Promise<void> {
    const userId = this.auth.currentUser()?.id;
    if (!userId) {
      this.view.set('no-shift');
      return;
    }

    const result = await this.cashierRepo.findOpenByUser(userId);
    result.fold(
      () => this.view.set('no-shift'),
      (shift) => {
        if (shift) {
          this.shift.set(shift);
          this.view.set('open-shift');
          this.loadShiftData(shift.id);
        } else {
          this.view.set('no-shift');
        }
      },
    );
  }

  private async loadShiftData(shiftId: string): Promise<void> {
    const [reconcileRes, paymentsRes] = await Promise.all([
      this.reconcileUC.execute({ shiftId }),
      this.listPaymentsUC.execute({ shiftId, page: 1, pageSize: 100 }),
    ]);

    reconcileRes.fold(
      (f) => { this.errorMsg.set(f.message); },
      (r) => this.reconcile.set(r),
    );

    paymentsRes.fold(
      (f) => { this.errorMsg.set(f.message); },
      (r) => this.payments.set(r.data),
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
        this.loading.set(false);
      },
      (shift) => {
        this.shift.set(shift);
        this.view.set('open-shift');
        this.loading.set(false);
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
        this.loading.set(false);
      },
      () => {
        this.shift.set(null);
        this.view.set('no-shift');
        this.loading.set(false);
        this.openForm.reset({ openingBalanceCents: 0 });
        this.closeForm.reset();
      },
    );
  }
}
