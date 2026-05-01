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
import { ToastService } from '../../../../core/services/toast.service';

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
  templateUrl: './customers-list.page.html',
  styleUrl: './customers-list.page.scss',
})
export class CustomersListPageComponent implements OnInit {
  protected readonly customers = signal<CustomerEntity[]>([]);
  protected readonly tableState = signal<TableState>('loading');
  protected readonly pagination = signal<PaginationMeta | null>(null);
  protected readonly sort = signal<SortParams | null>(null);

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
    private readonly toast: ToastService,
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
        (f) => this.toast.error(this.failureMsg(f)),
        () => { this.toast.success('Cliente creado exitosamente'); this.load(); },
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
        (f) => this.toast.error(this.failureMsg(f)),
        () => { this.toast.success('Cliente actualizado'); this.load(); },
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
        (f) => this.toast.error(this.failureMsg(f)),
        () => { this.toast.success('Cliente desactivado'); this.load(); },
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
