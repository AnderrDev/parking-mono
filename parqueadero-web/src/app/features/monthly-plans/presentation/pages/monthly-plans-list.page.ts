import {
  ChangeDetectionStrategy, Component, Inject, OnInit, signal,
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
    const ref = this.dialog.open<MonthlyPlanFormValue | null>(MonthlyPlanEditDialogComponent, {
      data: { plan: null } satisfies MonthlyPlanDialogData,
    });
    ref.closed.subscribe(async (value) => {
      if (!value) return;
      const result = await this.createUC.execute({
        vehiclePlate: value.vehiclePlate,
        customerId: value.customerId,
        planType: value.planType,
        startDate: new Date(value.startDate),
        endDate: new Date(value.endDate),
        amountCents: Number(value.amountCents),
        autoRenew: value.autoRenew,
        ...(value.paymentTokenId ? { paymentTokenId: value.paymentTokenId } : {}),
      });
      result.fold(
        (f) => this.toast.error(this.failureMsg(f)),
        (plan) => { this.toast.success(`Plan mensual creado para placa ${plan.vehiclePlate}`); this.load(); },
      );
    });
  }

  protected openEdit(plan: MonthlyPlanEntity): void {
    const ref = this.dialog.open<MonthlyPlanFormValue | null>(MonthlyPlanEditDialogComponent, {
      data: { plan } satisfies MonthlyPlanDialogData,
    });
    ref.closed.subscribe(async (value) => {
      if (!value) return;
      const result = await this.updateUC.execute({
        id: plan.id,
        endDate: new Date(value.endDate),
        autoRenew: value.autoRenew,
        amountCents: Number(value.amountCents),
        ...(value.paymentTokenId ? { paymentTokenId: value.paymentTokenId } : {}),
      });
      result.fold(
        (f) => this.toast.error(this.failureMsg(f)),
        () => { this.toast.success('Plan actualizado'); this.load(); },
      );
    });
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
