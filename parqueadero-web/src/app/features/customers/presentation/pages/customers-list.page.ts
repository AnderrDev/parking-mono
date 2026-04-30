import {
  ChangeDetectionStrategy, Component, Inject, OnInit, signal,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CustomerEntity } from '../../domain/entities/customer.entity';
import { DataTableComponent, TableColumn, TableState } from '../../../../shared/components/data-table/data-table.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ListCustomersUseCase } from '../../domain/usecases/list-customers.usecase';
import { CreateCustomerUseCase } from '../../domain/usecases/create-customer.usecase';
import { UpdateCustomerUseCase } from '../../domain/usecases/update-customer.usecase';
import { DeactivateCustomerUseCase } from '../../domain/usecases/deactivate-customer.usecase';
import {
  LIST_CUSTOMERS_TOKEN, CREATE_CUSTOMER_TOKEN,
  UPDATE_CUSTOMER_TOKEN, DEACTIVATE_CUSTOMER_TOKEN,
} from '../../../../core/di/injection-tokens';
import {
  CustomerEditDialogComponent, CustomerDialogData, CustomerFormValue,
} from '../components/customer-edit-dialog.component';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { SortParams } from '../../../../shared/models/sort.model';
import { Failure, BusinessRuleFailure, NetworkFailure, NotFoundFailure, ServerFailure, ValidationFailure } from '../../../../core/either/failures';
import { DocType } from '../../domain/entities/customer.entity';

interface Toast { message: string; type: 'success' | 'error'; id: number; }

const COLUMNS: TableColumn<CustomerEntity>[] = [
  { key: 'name', label: 'Nombre', sortable: true },
  { key: 'docType', label: 'Tipo doc', sortable: false },
  { key: 'docNumber', label: 'Número doc', sortable: true },
  { key: 'email', label: 'Email', sortable: false },
  { key: 'phone', label: 'Teléfono', sortable: false },
  { key: '_actions', label: 'Acciones', sortable: false },
];

const DOC_LABEL: Record<string, string> = {
  cedula: 'Cédula', nit: 'NIT', pasaporte: 'Pasaporte',
};

@Component({
  selector: 'app-customers-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent],
  template: `
    <div class="page">
      <header class="page__header">
        <div>
          <h1 class="page__title">Clientes</h1>
          <p class="page__subtitle">Gestión de clientes del parqueadero.</p>
        </div>
        <button class="btn btn--primary" (click)="openCreate()">+ Nuevo cliente</button>
      </header>

      <div class="page__filters">
        <label class="filter-group">
          <span class="filter-group__label">Buscar</span>
          <input class="filter-group__input" type="search" placeholder="Nombre o documento…"
            (input)="onSearch($event)" />
        </label>
        <label class="filter-group filter-group--checkbox">
          <input type="checkbox" (change)="onShowDeleted($event)" />
          <span>Mostrar eliminados</span>
        </label>
      </div>

      <app-data-table
        [columns]="columns"
        [rows]="customers()"
        [state]="tableState()"
        caption="Lista de clientes"
        emptyTitle="Sin clientes"
        emptyDescription="Crea el primer cliente con el botón 'Nuevo cliente'."
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
        @case ('docType') { {{ docLabel(row.docType) }} }
        @case ('email') { {{ row.email ?? '—' }} }
        @case ('phone') { {{ row.phone ?? '—' }} }
        @case ('_actions') {
          <div class="row-actions">
            <button class="btn-icon" title="Editar" (click)="openEdit(row); $event.stopPropagation()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            @if (!row.isDeleted) {
              <button class="btn-icon btn-icon--danger" title="Desactivar" (click)="confirmDeactivate(row); $event.stopPropagation()">
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
    .filter-group--checkbox { flex-direction: row; align-items: center; gap: var(--space-2); cursor: pointer; font-size: var(--text-sm); }
    .filter-group__label { font-size: var(--text-xs); font-weight: var(--font-weight-medium); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .filter-group__input { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--text-sm); background: var(--color-surface); color: var(--color-text); min-height: var(--touch-target-secondary); min-width: 220px; }
    .btn { padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); font-weight: var(--font-weight-semibold); font-size: var(--text-sm); cursor: pointer; min-height: var(--touch-target-secondary); }
    .btn--primary { background: var(--color-primary); color: var(--color-primary-fg); }
    .row-actions { display: flex; gap: var(--space-1); }
    .btn-icon { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--radius-md); color: var(--color-text-muted); &:hover { background: var(--color-surface-2); color: var(--color-text); } }
    .btn-icon--danger:hover { background: color-mix(in srgb, var(--color-danger) 12%, transparent); color: var(--color-danger); }
    .toast { position: fixed; bottom: var(--space-6); right: var(--space-6); background: var(--color-success); color: #fff; padding: var(--space-3) var(--space-5); border-radius: var(--radius-md); box-shadow: var(--shadow-2); font-size: var(--text-sm); font-weight: var(--font-weight-medium); z-index: 9999; animation: slide-in 250ms ease; }
    .toast--error { background: var(--color-danger); }
    @keyframes slide-in { from { transform: translateX(110%); opacity: 0; } to { transform: none; opacity: 1; } }
  `],
})
export class CustomersListPageComponent implements OnInit {
  protected readonly customers = signal<CustomerEntity[]>([]);
  protected readonly tableState = signal<TableState>('loading');
  protected readonly pagination = signal<PaginationMeta | null>(null);
  protected readonly sort = signal<SortParams | null>(null);
  protected readonly toasts = signal<Toast[]>([]);

  private toastCounter = 0;
  private currentPage = 1;
  private searchTerm: string | null = null;
  private showDeleted = false;

  protected readonly columns = COLUMNS;

  constructor(
    @Inject(LIST_CUSTOMERS_TOKEN) private readonly listUC: ListCustomersUseCase,
    @Inject(CREATE_CUSTOMER_TOKEN) private readonly createUC: CreateCustomerUseCase,
    @Inject(UPDATE_CUSTOMER_TOKEN) private readonly updateUC: UpdateCustomerUseCase,
    @Inject(DEACTIVATE_CUSTOMER_TOKEN) private readonly deactivateUC: DeactivateCustomerUseCase,
    private readonly dialog: Dialog,
  ) {}

  ngOnInit(): void { this.load(); }

  protected docLabel(dt: string): string { return DOC_LABEL[dt] ?? dt; }

  async load(): Promise<void> {
    this.tableState.set('loading');
    const s = this.sort();
    const result = await this.listUC.execute({
      search: this.searchTerm,
      includeDeleted: this.showDeleted,
      pagination: { page: this.currentPage, pageSize: 25 },
      ...(s ? { sort: s } : {}),
    });
    result.fold(
      (f) => this.tableState.set(f instanceof NetworkFailure ? 'offline' : 'error'),
      ({ data, pagination }) => {
        this.customers.set(data);
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

  protected onShowDeleted(event: Event): void {
    this.showDeleted = (event.target as HTMLInputElement).checked;
    this.currentPage = 1;
    this.load();
  }

  protected onSort(s: SortParams): void { this.sort.set(s); this.currentPage = 1; this.load(); }
  protected onPage(page: number): void { this.currentPage = page; this.load(); }

  protected openCreate(): void {
    const ref = this.dialog.open<CustomerFormValue | null>(CustomerEditDialogComponent, {
      data: { customer: null } satisfies CustomerDialogData,
    });
    ref.closed.subscribe(async (value) => {
      if (!value) return;
      const result = await this.createUC.execute({
        docType: value.docType as DocType,
        docNumber: value.docNumber,
        dv: value.dv,
        name: value.name,
        email: value.email || null,
        phone: value.phone || null,
        address: value.address || null,
        municipio: value.municipio || null,
        departamento: value.departamento || null,
        responsabilidadesFiscales: value.responsabilidadesFiscales
          ? value.responsabilidadesFiscales.split(',').map(s => s.trim()).filter(Boolean)
          : ['R-99-PN'],
      });
      result.fold(
        (f) => this.showToast(this.failureMsg(f), 'error'),
        () => { this.showToast('Cliente creado exitosamente', 'success'); this.load(); },
      );
    });
  }

  protected openEdit(customer: CustomerEntity): void {
    const ref = this.dialog.open<CustomerFormValue | null>(CustomerEditDialogComponent, {
      data: { customer } satisfies CustomerDialogData,
    });
    ref.closed.subscribe(async (value) => {
      if (!value) return;
      const result = await this.updateUC.execute({
        id: customer.id,
        name: value.name,
        email: value.email || null,
        phone: value.phone || null,
        address: value.address || null,
        municipio: value.municipio || null,
        departamento: value.departamento || null,
        ...(value.responsabilidadesFiscales ? {
          responsabilidadesFiscales: value.responsabilidadesFiscales.split(',').map(s => s.trim()).filter(Boolean),
        } : {}),
      });
      result.fold(
        (f) => this.showToast(this.failureMsg(f), 'error'),
        () => { this.showToast('Cliente actualizado', 'success'); this.load(); },
      );
    });
  }

  protected confirmDeactivate(customer: CustomerEntity): void {
    const ref = this.dialog.open<boolean>(ConfirmDialogComponent, {
      data: {
        title: 'Desactivar cliente',
        message: `¿Desactivar a "${customer.name}"? Esta acción aplica soft delete.`,
        confirmLabel: 'Desactivar',
        variant: 'danger',
      } satisfies ConfirmDialogData,
    });
    ref.closed.subscribe(async (confirmed) => {
      if (!confirmed) return;
      const result = await this.deactivateUC.execute({ id: customer.id });
      result.fold(
        (f) => this.showToast(this.failureMsg(f), 'error'),
        () => { this.showToast('Cliente desactivado', 'success'); this.load(); },
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
