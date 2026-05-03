import {
  ChangeDetectionStrategy, Component, Inject, OnInit, ViewContainerRef, signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { MonthlyPlanEntity, MonthlyPlanStatus } from '../../../parking/domain/entities/monthly-plan.entity';
import { DataTableComponent, TableColumn, TableState } from '../../../../shared/components/data-table/data-table.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { CurrencyCopPipe } from '../../../../shared/pipes/currency-cop.pipe';
import { ListMonthlyPlansUseCase } from '../../domain/usecases/list-monthly-plans.usecase';
import { CreateMonthlyPlanUseCase } from '../../domain/usecases/create-monthly-plan.usecase';
import { UpdateMonthlyPlanUseCase } from '../../domain/usecases/update-monthly-plan.usecase';
import { CancelMonthlyPlanUseCase } from '../../domain/usecases/cancel-monthly-plan.usecase';
import {
  LIST_MONTHLY_PLANS_TOKEN, CREATE_MONTHLY_PLAN_TOKEN,
  UPDATE_MONTHLY_PLAN_TOKEN, CANCEL_MONTHLY_PLAN_TOKEN,
} from '../../../../core/di/injection-tokens';
import {
  MonthlyPlanEditDialogComponent, MonthlyPlanDialogData, MonthlyPlanFormValue,
} from '../components/monthly-plan-edit-dialog.component';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { SortParams } from '../../../../shared/models/sort.model';
import {
  Failure, BusinessRuleFailure, NetworkFailure, NotFoundFailure, ServerFailure, ValidationFailure,
} from '../../../../core/either/failures';
import { ToastService } from '../../../../core/services/toast.service';
import { AuthStateService } from '../../../../core/services/auth-state.service';
import { PaymentMethod } from '../../../parking/domain/entities/payment.entity';

const STATUS_OPTIONS: { value: MonthlyPlanStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'expiring', label: 'Por vencer' },
  { value: 'expired', label: 'Vencido' },
  { value: 'cancelled', label: 'Cancelado' },
];

const COLUMNS: TableColumn<MonthlyPlanEntity>[] = [
  { key: 'vehiclePlate', label: 'Placa', sortable: true },
  { key: 'planType', label: 'Tipo plan', sortable: false },
  { key: 'startDate', label: 'Inicio', sortable: true },
  { key: 'endDate', label: 'Vence', sortable: true },
  { key: 'amountCents', label: 'Valor', sortable: false },
  { key: 'status', label: 'Estado', sortable: true },
  { key: 'autoRenew', label: 'Auto-renovar', sortable: false },
  { key: '_actions', label: 'Acciones', sortable: false },
];

const PLAN_LABEL: Record<string, string> = { basico: 'Básico', premium: 'Premium', ilimitado: 'Ilimitado' };
const STATUS_BADGE: Record<string, string> = {
  active: 'badge--green', expiring: 'badge--yellow', expired: 'badge--red', cancelled: 'badge--gray',
};
const STATUS_LABEL: Record<string, string> = {
  active: 'Activo', expiring: 'Por vencer', expired: 'Vencido', cancelled: 'Cancelado',
};

@Component({
  selector: 'app-monthly-plans-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, CurrencyCopPipe, DatePipe],
  templateUrl: './monthly-plans-list.page.html',
  styleUrl: './monthly-plans-list.page.scss',
})
export class MonthlyPlansListPageComponent implements OnInit {
  protected readonly plans = signal<MonthlyPlanEntity[]>([]);
  protected readonly tableState = signal<TableState>('loading');
  protected readonly pagination = signal<PaginationMeta | null>(null);
  protected readonly sort = signal<SortParams | null>(null);
  private currentPage = 1;
  private searchTerm: string | null = null;
  private filterStatus: MonthlyPlanStatus | null = null;

  protected readonly columns = COLUMNS;
  protected readonly statusOptions = STATUS_OPTIONS;

  constructor(
    @Inject(LIST_MONTHLY_PLANS_TOKEN) private readonly listUC: ListMonthlyPlansUseCase,
    @Inject(CREATE_MONTHLY_PLAN_TOKEN) private readonly createUC: CreateMonthlyPlanUseCase,
    @Inject(UPDATE_MONTHLY_PLAN_TOKEN) private readonly updateUC: UpdateMonthlyPlanUseCase,
    @Inject(CANCEL_MONTHLY_PLAN_TOKEN) private readonly cancelUC: CancelMonthlyPlanUseCase,
    private readonly dialog: Dialog,
    private readonly toast: ToastService,
    private readonly auth: AuthStateService,
    /**
     * Necesario para que los dialogs hereden los providers del route
     * (TARIFF_REPOSITORY, GET_ACTIVE_MONTHLY_TARIFF, etc.). Pasar
     * `viewContainerRef` en `dialog.open` es la forma más fiable; con
     * `injector: this.injector` no siempre traversa al EnvironmentInjector.
     */
    private readonly vcr: ViewContainerRef,
  ) {}

  ngOnInit(): void { this.load(); }

  protected planLabel(t: string): string { return PLAN_LABEL[t] ?? t; }
  protected statusLabel(s: string): string { return STATUS_LABEL[s] ?? s; }
  protected statusBadge(s: string): string { return STATUS_BADGE[s] ?? ''; }

  async load(): Promise<void> {
    this.tableState.set('loading');
    const s = this.sort();
    const result = await this.listUC.execute({
      search: this.searchTerm,
      status: this.filterStatus,
      pagination: { page: this.currentPage, pageSize: 25 },
      ...(s ? { sort: s } : {}),
    });
    result.fold(
      (f) => this.tableState.set(f instanceof NetworkFailure ? 'offline' : 'error'),
      ({ data, pagination }) => {
        this.plans.set(data);
        this.pagination.set(pagination);
        this.tableState.set(data.length ? 'success' : 'empty');
      },
    );
  }

  private searchTimeout?: ReturnType<typeof setTimeout>;
  protected onSearch(event: Event): void {
    const val = (event.target as HTMLInputElement).value.trim();
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.searchTerm = val || null;
      this.currentPage = 1;
      this.load();
    }, 300);
  }

  protected onStatusFilter(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.filterStatus = val ? val as MonthlyPlanStatus : null;
    this.currentPage = 1;
    this.load();
  }

  protected onSort(s: SortParams): void { this.sort.set(s); this.currentPage = 1; this.load(); }
  protected onPage(page: number): void { this.currentPage = page; this.load(); }

  protected openCreate(): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId) {
      this.toast.error('Sesión expirada. Vuelve a iniciar sesión.');
      return;
    }
    const ref = this.dialog.open<MonthlyPlanFormValue | null>(MonthlyPlanEditDialogComponent, {
      viewContainerRef: this.vcr,
      data: {
        plan: null,
        onSubmit: async (value) => {
          const result = await this.createUC.execute({
            vehiclePlate: value.vehiclePlate,
            customerId: value.customerId,
            planType: value.planType,
            startDate: this.parseLocalDate(value.startDate),
            endDate: this.parseLocalDate(value.endDate),
            amountCents: Number(value.amountCents),
            autoRenew: value.autoRenew,
            ...(value.paymentTokenId ? { paymentTokenId: value.paymentTokenId } : {}),
            paymentMethod: value.paymentMethod as PaymentMethod,
            userId,
          });
          return result.fold(
            (f) => this.failureMsg(f),
            () => null,
          );
        },
      } satisfies MonthlyPlanDialogData,
    });
    ref.closed.subscribe((value) => {
      if (!value) return;
      this.toast.success(`Plan creado para ${value.vehiclePlate} · ingreso registrado`);
      this.load();
      this.askPrintReceipt(value);
    });
  }

  /** Pregunta si imprimir comprobante de mensualidad. Si sí, abre print window. */
  private askPrintReceipt(value: MonthlyPlanFormValue): void {
    const ref = this.dialog.open<boolean>(ConfirmDialogComponent, {
      data: {
        title: 'Comprobante de mensualidad',
        message: `¿Imprimir comprobante para ${value.vehiclePlate}?`,
        confirmLabel: 'Imprimir',
        cancelLabel: 'No',
        variant: 'default',
      } satisfies ConfirmDialogData,
    });
    ref.closed.subscribe((confirmed) => {
      if (!confirmed) return;
      this.printReceipt(value);
    });
  }

  private printReceipt(v: MonthlyPlanFormValue): void {
    const w = window.open('', '_blank', 'width=420,height=720');
    if (!w) return;
    const fmt = (cents: number) =>
      new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 })
        .format(Math.round(cents / 100)).replace('COP', '$').trim();
    const fmtDate = (iso: string) => {
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    };
    const methodLabel: Record<string, string> = {
      efectivo: 'Efectivo', tarjeta_credito: 'Tarjeta crédito', tarjeta_debito: 'Tarjeta débito',
      transferencia: 'Transferencia', nequi: 'Nequi', daviplata: 'Daviplata',
    };
    const c = v.customerSnapshot;
    const now = new Date().toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Comprobante mensualidad ${v.vehiclePlate}</title>
<style>
  body { font-family: 'Courier New', monospace; font-size: 13px; margin: 0; padding: 20px; color: #111; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
  .sub { text-align: center; font-size: 11px; color: #555; margin-bottom: 16px; }
  .plate { font-size: 26px; font-weight: bold; text-align: center; letter-spacing: 0.12em; margin: 12px 0; border: 2px solid #111; padding: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  td { padding: 5px 2px; border-bottom: 1px dotted #ccc; }
  td:last-child { text-align: right; }
  .total td { border-top: 2px solid #111; border-bottom: none; padding-top: 8px; font-size: 15px; font-weight: bold; }
  .footer { margin-top: 20px; font-size: 10px; text-align: center; color: #888; }
  @media print { button { display: none; } }
</style></head>
<body>
  <h1>PARQUEADERO</h1>
  <p class="sub">Comprobante de mensualidad</p>
  <div class="plate">${v.vehiclePlate}</div>
  <table>
    ${c ? `<tr><td>Cliente</td><td>${c.name}</td></tr>
    <tr><td>Documento</td><td>${c.docType} ${c.docNumber}</td></tr>` : ''}
    <tr><td>Plan</td><td>${v.planType}</td></tr>
    <tr><td>Vigencia desde</td><td>${fmtDate(v.startDate)}</td></tr>
    <tr><td>Vigencia hasta</td><td>${fmtDate(v.endDate)}</td></tr>
    <tr><td>Método de pago</td><td>${methodLabel[v.paymentMethod] ?? v.paymentMethod}</td></tr>
    <tr class="total"><td>Total</td><td>${fmt(Number(v.amountCents))}</td></tr>
  </table>
  <p class="footer">Generado el ${now}</p>
</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  protected openEdit(plan: MonthlyPlanEntity): void {
    const ref = this.dialog.open<MonthlyPlanFormValue | null>(MonthlyPlanEditDialogComponent, {
      viewContainerRef: this.vcr,
      data: {
        plan,
        onSubmit: async (value) => {
          const result = await this.updateUC.execute({
            id: plan.id,
            endDate: this.parseLocalDate(value.endDate),
            autoRenew: value.autoRenew,
            amountCents: Number(value.amountCents),
            ...(value.paymentTokenId ? { paymentTokenId: value.paymentTokenId } : {}),
          });
          return result.fold(
            (f) => this.failureMsg(f),
            () => null,
          );
        },
      } satisfies MonthlyPlanDialogData,
    });
    ref.closed.subscribe((value) => {
      if (!value) return;
      this.toast.success('Plan actualizado');
      this.load();
    });
  }

  /** Convierte 'YYYY-MM-DD' (zona local Bogotá) a Date sin caer en UTC. */
  private parseLocalDate(iso: string): Date {
    const parts = iso.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  protected confirmCancel(plan: MonthlyPlanEntity): void {
    const ref = this.dialog.open<boolean>(ConfirmDialogComponent, {
      data: {
        title: 'Cancelar plan mensual',
        message: `¿Cancelar el plan de placa ${plan.vehiclePlate}? Las sesiones en curso no se verán afectadas.`,
        confirmLabel: 'Cancelar plan',
        variant: 'danger',
      } satisfies ConfirmDialogData,
    });
    ref.closed.subscribe(async (confirmed) => {
      if (!confirmed) return;
      const result = await this.cancelUC.execute({ id: plan.id });
      result.fold(
        (f) => this.toast.error(this.failureMsg(f)),
        () => { this.toast.success('Plan mensual cancelado'); this.load(); },
      );
    });
  }

  private failureMsg(f: Failure): string {
    if (f instanceof ValidationFailure || f instanceof BusinessRuleFailure || f instanceof NotFoundFailure) {
      return f.message;
    }
    if (f instanceof NetworkFailure) return 'Sin conexión. Intenta de nuevo.';
    if (f instanceof ServerFailure) return 'Error del servidor. Intenta más tarde.';
    return 'Error inesperado.';
  }
}
