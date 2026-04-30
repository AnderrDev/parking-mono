import {
  ChangeDetectionStrategy, Component, Inject, OnInit, signal,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { TariffEntity, TariffUnit } from '../../../parking/domain/entities/tariff.entity';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';
import { DataTableComponent, TableColumn, TableState } from '../../../../shared/components/data-table/data-table.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { CurrencyCopPipe } from '../../../../shared/pipes/currency-cop.pipe';
import { ListTariffsUseCase } from '../../domain/usecases/list-tariffs.usecase';
import { CreateTariffUseCase } from '../../domain/usecases/create-tariff.usecase';
import { UpdateTariffUseCase } from '../../domain/usecases/update-tariff.usecase';
import { DeactivateTariffUseCase } from '../../domain/usecases/deactivate-tariff.usecase';
import { TariffEditDialogComponent, TariffDialogData, TariffFormValue } from '../components/tariff-edit-dialog.component';
import {
  LIST_TARIFFS_TOKEN, CREATE_TARIFF_TOKEN, UPDATE_TARIFF_TOKEN, DEACTIVATE_TARIFF_TOKEN,
} from '../../../../core/di/injection-tokens';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { SortParams } from '../../../../shared/models/sort.model';
import {
  Failure, BusinessRuleFailure, NetworkFailure, NotFoundFailure, ServerFailure, ValidationFailure,
} from '../../../../core/either/failures';

interface Toast { message: string; type: 'success' | 'error'; id: number; }

const COLUMNS: TableColumn<TariffEntity>[] = [
  { key: 'name', label: 'Nombre', sortable: true },
  { key: 'vehicleType', label: 'Vehículo', sortable: true },
  { key: 'unit', label: 'Unidad', sortable: false },
  { key: 'valueCents', label: 'Valor', sortable: true },
  { key: 'dailyCapCents', label: 'Tope diario', sortable: true },
  { key: 'graceMinutes', label: 'Gracia (min)', sortable: false },
  { key: 'isActive', label: 'Estado', sortable: false },
  { key: '_actions', label: 'Acciones', sortable: false },
];

const VEHICLE_LABEL: Record<string, string> = {
  carro: 'Carro', moto: 'Moto', bicicleta: 'Bicicleta', otro: 'Otro',
};

const UNIT_LABEL: Record<string, string> = {
  hora: 'Por hora', fraccion: 'Por fracción', minuto: 'Por minuto', dia: 'Por día',
};

@Component({
  selector: 'app-tariffs-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, CurrencyCopPipe],
  template: `
    <div class="page">
      <header class="page__header">
        <div>
          <h1 class="page__title">Tarifas</h1>
          <p class="page__subtitle">Gestión de tarifas de cobro por tipo de vehículo.</p>
        </div>
        <button class="btn btn--primary" (click)="openCreate()">+ Nueva tarifa</button>
      </header>

      <div class="page__filters">
        <label class="filter-group">
          <span class="filter-group__label">Tipo vehículo</span>
          <select class="filter-group__select" (change)="onTypeFilter($event)">
            <option value="">Todos</option>
            <option value="carro">Carro</option>
            <option value="moto">Moto</option>
            <option value="bicicleta">Bicicleta</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label class="filter-group filter-group--checkbox">
          <input type="checkbox" (change)="onShowInactive($event)" />
          <span>Mostrar inactivas</span>
        </label>
      </div>

      <app-data-table
        [columns]="columns"
        [rows]="tariffs()"
        [state]="tableState()"
        caption="Lista de tarifas"
        emptyTitle="Sin tarifas"
        emptyDescription="Crea la primera tarifa con el botón 'Nueva tarifa'."
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
        @case ('vehicleType') { {{ vehicleLabel(row.vehicleType) }} }
        @case ('unit') { {{ unitLabel(row.unit) }} }
        @case ('valueCents') { {{ row.valueCents | currencyCop }} }
        @case ('dailyCapCents') { {{ row.dailyCapCents | currencyCop }} }
        @case ('isActive') {
          <span class="badge" [class.badge--green]="row.isActive" [class.badge--gray]="!row.isActive">
            {{ row.isActive ? 'Activa' : 'Inactiva' }}
          </span>
        }
        @case ('_actions') {
          <div class="row-actions">
            <button class="btn-icon" title="Editar" (click)="openEdit(row); $event.stopPropagation()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            @if (row.isActive) {
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
    .page__filters { display: flex; gap: var(--space-4); flex-wrap: wrap; align-items: center; }
    .filter-group { display: flex; flex-direction: column; gap: var(--space-1); }
    .filter-group--checkbox { flex-direction: row; align-items: center; gap: var(--space-2); cursor: pointer; font-size: var(--text-sm); }
    .filter-group__label { font-size: var(--text-xs); font-weight: var(--font-weight-medium); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .filter-group__select { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--text-sm); background: var(--color-surface); color: var(--color-text); min-height: var(--touch-target-secondary); }
    .btn { padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); font-weight: var(--font-weight-semibold); font-size: var(--text-sm); cursor: pointer; min-height: var(--touch-target-secondary); }
    .btn--primary { background: var(--color-primary); color: var(--color-primary-fg); }
    .badge { display: inline-flex; padding: 2px var(--space-2); border-radius: var(--radius-full); font-size: var(--text-xs); font-weight: var(--font-weight-medium); }
    .badge--green { background: color-mix(in srgb, var(--color-success) 15%, transparent); color: var(--color-success); }
    .badge--gray { background: var(--color-surface-2); color: var(--color-text-muted); }
    .row-actions { display: flex; gap: var(--space-1); }
    .btn-icon { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--radius-md); color: var(--color-text-muted); &:hover { background: var(--color-surface-2); color: var(--color-text); } }
    .btn-icon--danger:hover { background: color-mix(in srgb, var(--color-danger) 12%, transparent); color: var(--color-danger); }
    .toast { position: fixed; bottom: var(--space-6); right: var(--space-6); background: var(--color-success); color: #fff; padding: var(--space-3) var(--space-5); border-radius: var(--radius-md); box-shadow: var(--shadow-2); font-size: var(--text-sm); font-weight: var(--font-weight-medium); z-index: 9999; animation: slide-in 250ms ease; }
    .toast--error { background: var(--color-danger); }
    @keyframes slide-in { from { transform: translateX(110%); opacity: 0; } to { transform: none; opacity: 1; } }
  `],
})
export class TariffsListPageComponent implements OnInit {
  protected readonly tariffs = signal<TariffEntity[]>([]);
  protected readonly tableState = signal<TableState>('loading');
  protected readonly pagination = signal<PaginationMeta | null>(null);
  protected readonly sort = signal<SortParams | null>(null);
  protected readonly toasts = signal<Toast[]>([]);

  private toastCounter = 0;
  private currentPage = 1;
  private filterType: VehicleType | null = null;
  private showInactive = false;

  protected readonly columns = COLUMNS;

  constructor(
    @Inject(LIST_TARIFFS_TOKEN) private readonly listUC: ListTariffsUseCase,
    @Inject(CREATE_TARIFF_TOKEN) private readonly createUC: CreateTariffUseCase,
    @Inject(UPDATE_TARIFF_TOKEN) private readonly updateUC: UpdateTariffUseCase,
    @Inject(DEACTIVATE_TARIFF_TOKEN) private readonly deactivateUC: DeactivateTariffUseCase,
    private readonly dialog: Dialog,
  ) {}

  ngOnInit(): void { this.load(); }

  protected vehicleLabel(vt: string): string { return VEHICLE_LABEL[vt] ?? vt; }
  protected unitLabel(u: string): string { return UNIT_LABEL[u] ?? u; }

  async load(): Promise<void> {
    this.tableState.set('loading');
    const s = this.sort();
    const result = await this.listUC.execute({
      vehicleType: this.filterType,
      isActive: this.showInactive ? null : true,
      pagination: { page: this.currentPage, pageSize: 25 },
      ...(s ? { sort: s } : {}),
    });
    result.fold(
      (f) => this.tableState.set(f instanceof NetworkFailure ? 'offline' : 'error'),
      ({ data, pagination }) => {
        this.tariffs.set(data);
        this.pagination.set(pagination);
        this.tableState.set(data.length ? 'success' : 'empty');
      },
    );
  }

  protected onTypeFilter(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.filterType = val ? val as VehicleType : null;
    this.currentPage = 1;
    this.load();
  }

  protected onShowInactive(event: Event): void {
    this.showInactive = (event.target as HTMLInputElement).checked;
    this.currentPage = 1;
    this.load();
  }

  protected onSort(s: SortParams): void { this.sort.set(s); this.currentPage = 1; this.load(); }
  protected onPage(page: number): void { this.currentPage = page; this.load(); }

  protected openCreate(): void {
    const ref = this.dialog.open<TariffFormValue | null>(TariffEditDialogComponent, {
      data: { tariff: null } satisfies TariffDialogData,
    });
    ref.closed.subscribe(async (value) => {
      if (!value) return;
      const result = await this.createUC.execute({
        name: value.name,
        vehicleType: value.vehicleType as VehicleType,
        unit: value.unit as TariffUnit,
        valueCents: Number(value.valueCents),
        graceMinutes: Number(value.graceMinutes),
        dailyCapCents: Number(value.dailyCapCents),
        validFrom: value.validFrom ? new Date(value.validFrom) : null,
        validTo: value.validTo ? new Date(value.validTo) : null,
      });
      result.fold(
        (f) => this.showToast(this.failureMsg(f), 'error'),
        () => { this.showToast('Tarifa creada exitosamente', 'success'); this.load(); },
      );
    });
  }

  protected openEdit(tariff: TariffEntity): void {
    const ref = this.dialog.open<TariffFormValue | null>(TariffEditDialogComponent, {
      data: { tariff } satisfies TariffDialogData,
    });
    ref.closed.subscribe(async (value) => {
      if (!value) return;
      const result = await this.updateUC.execute({
        id: tariff.id,
        name: value.name,
        valueCents: Number(value.valueCents),
        graceMinutes: Number(value.graceMinutes),
        dailyCapCents: Number(value.dailyCapCents),
        validFrom: value.validFrom ? new Date(value.validFrom) : null,
        validTo: value.validTo ? new Date(value.validTo) : null,
        isActive: value.isActive,
      });
      result.fold(
        (f) => this.showToast(this.failureMsg(f), 'error'),
        () => { this.showToast('Tarifa actualizada', 'success'); this.load(); },
      );
    });
  }

  protected confirmDeactivate(tariff: TariffEntity): void {
    const ref = this.dialog.open<boolean>(ConfirmDialogComponent, {
      data: {
        title: 'Desactivar tarifa',
        message: `¿Desactivar "${tariff.name}"? Las sesiones en curso no se verán afectadas.`,
        confirmLabel: 'Desactivar',
        variant: 'danger',
      } satisfies ConfirmDialogData,
    });
    ref.closed.subscribe(async (confirmed) => {
      if (!confirmed) return;
      const result = await this.deactivateUC.execute({ id: tariff.id });
      result.fold(
        (f) => this.showToast(this.failureMsg(f), 'error'),
        () => { this.showToast('Tarifa desactivada', 'success'); this.load(); },
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
