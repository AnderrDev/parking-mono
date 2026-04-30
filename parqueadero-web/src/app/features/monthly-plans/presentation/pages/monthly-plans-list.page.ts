import {
  ChangeDetectionStrategy, Component, Inject, OnInit, signal,
} from '@angular/core';
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

interface Toast { message: string; type: 'success' | 'error'; id: number; }

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
  imports: [DataTableComponent, CurrencyCopPipe],
  template: `
    <div class="page">
      <header class="page__header">
        <div>
          <h1 class="page__title">Mensualidades</h1>
          <p class="page__subtitle">Gestión de planes mensuales de parqueo.</p>
        </div>
        <button class="btn btn--primary" (click)="openCreate()">+ Nuevo plan</button>
      </header>

      <div class="page__filters">
        <label class="filter-group">
          <span class="filter-group__label">Placa</span>
          <input class="filter-group__input" type="search" placeholder="Buscar placa…"
            (input)="onSearch($event)" />
        </label>
        <label class="filter-group">
          <span class="filter-group__label">Estado</span>
          <select class="filter-group__select" (change)="onStatusFilter($event)">
            @for (opt of statusOptions; track opt.value) {
              <option [value]="opt.value">{{ opt.label }}</option>
            }
          </select>
        </label>
      </div>

      <app-data-table
        [columns]="columns"
        [rows]="plans()"
        [state]="tableState()"
        caption="Lista de planes mensuales"
        emptyTitle="Sin planes"
        emptyDescription="Crea el primer plan mensual con el botón 'Nuevo plan'."
        [pagination]="pagination()"
        [currentSort]="sort()"
        [cellTemplate]="cellTpl"
        (sortChange)="onSort($event)"
        (pageChange)="onPage($event)"
        (retry)="load()"
      />
    </div>

    <ng-template #cellTpl let-row let-col="column">
      @switch (col.key) {
        @case ('planType') { {{ planLabel(row.planType) }} }
        @case ('startDate') { {{ row.startDate | date:'dd/MM/yyyy' }} }
        @case ('endDate') { {{ row.endDate | date:'dd/MM/yyyy' }} }
        @case ('amountCents') { {{ row.amountCents | currencyCop }} }
        @case ('autoRenew') { {{ row.autoRenew ? 'Sí' : 'No' }} }
        @case ('status') {
          <span class="badge" [class]="statusBadge(row.status)">
            {{ statusLabel(row.status) }}
          </span>
        }
        @case ('_actions') {
          <div class="row-actions">
            @if (row.status === 'active' || row.status === 'expiring') {
              <button class="btn-icon" title="Editar" (click)="openEdit(row); $event.stopPropagation()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-icon btn-icon--danger" title="Cancelar plan" (click)="confirmCancel(row); $event.stopPropagation()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              </button>
            }
          </div>
        }
        @default { {{ $any(row)[col.key] ?? '—' }} }
      }
    </ng-template>

    @for (toast of toasts(); track toast.id) {
      <div class="toast" [class.toast--error]="toast.type === 'error'" role="alert" aria-live="polite">
        {{ toast.message }}
      </div>
    }
  `,
  styles: [`
    .page { display: flex; flex-direction: column; gap: var(--space-5); padding: var(--space-6); max-width: 1200px; }
    .page__header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
    .page__title { font-size: var(--text-2xl); font-weight: var(--font-weight-bold); margin: 0; }
    .page__subtitle { font-size: var(--text-sm); color: var(--color-text-muted); margin: var(--space-1) 0 0; }
    .page__filters { display: flex; gap: var(--space-4); flex-wrap: wrap; align-items: flex-end; }
    .filter-group { display: flex; flex-direction: column; gap: var(--space-1); }
    .filter-group__label { font-size: var(--text-xs); font-weight: var(--font-weight-medium); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .filter-group__input, .filter-group__select { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--text-sm); background: var(--color-surface); color: var(--color-text); min-height: var(--touch-target-secondary); }
    .filter-group__input { min-width: 180px; }
    .btn { padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); font-weight: var(--font-weight-semibold); font-size: var(--text-sm); cursor: pointer; min-height: var(--touch-target-secondary); }
    .btn--primary { background: var(--color-primary); color: var(--color-primary-fg); }
    .badge { display: inline-flex; padding: 2px var(--space-2); border-radius: var(--radius-full); font-size: var(--text-xs); font-weight: var(--font-weight-medium); }
    .badge--green { background: color-mix(in srgb, var(--color-success) 15%, transparent); color: var(--color-success); }
    .badge--yellow { background: color-mix(in srgb, var(--color-warning) 15%, transparent); color: color-mix(in srgb, var(--color-warning) 80%, #000); }
    .badge--red { background: color-mix(in srgb, var(--color-danger) 15%, transparent); color: var(--color-danger); }
    .badge--gray { background: var(--color-surface-2); color: var(--color-text-muted); }
    .row-actions { display: flex; gap: var(--space-1); }
    .btn-icon { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--radius-md); color: var(--color-text-muted); &:hover { background: var(--color-surface-2); color: var(--color-text); } }
    .btn-icon--danger:hover { background: color-mix(in srgb, var(--color-danger) 12%, transparent); color: var(--color-danger); }
    .toast { position: fixed; bottom: var(--space-6); right: var(--space-6); background: var(--color-success); color: #fff; padding: var(--space-3) var(--space-5); border-radius: var(--radius-md); box-shadow: var(--shadow-2); font-size: var(--text-sm); font-weight: var(--font-weight-medium); z-index: 9999; animation: slide-in 250ms ease; }
    .toast--error { background: var(--color-danger); }
    @keyframes slide-in { from { transform: translateX(110%); opacity: 0; } to { transform: none; opacity: 1; } }
  `],
})
export class MonthlyPlansListPageComponent implements OnInit {
  protected readonly plans = signal<MonthlyPlanEntity[]>([]);
  protected readonly tableState = signal<TableState>('loading');
  protected readonly pagination = signal<PaginationMeta | null>(null);
  protected readonly sort = signal<SortParams | null>(null);
  protected readonly toasts = signal<Toast[]>([]);

  private toastCounter = 0;
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
        (f) => this.showToast(this.failureMsg(f), 'error'),
        (plan) => { this.showToast(`Plan mensual creado para placa ${plan.vehiclePlate}`, 'success'); this.load(); },
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
        (f) => this.showToast(this.failureMsg(f), 'error'),
        () => { this.showToast('Plan actualizado', 'success'); this.load(); },
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
        (f) => this.showToast(this.failureMsg(f), 'error'),
        () => { this.showToast('Plan mensual cancelado', 'success'); this.load(); },
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

  private showToast(message: string, type: Toast['type']): void {
    const id = ++this.toastCounter;
    this.toasts.update(t => [...t, { message, type, id }]);
    setTimeout(() => this.toasts.update(t => t.filter(x => x.id !== id)), 4000);
  }
}
