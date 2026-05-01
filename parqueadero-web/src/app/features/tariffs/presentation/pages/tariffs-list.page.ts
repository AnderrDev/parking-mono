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
import { ToastService } from '../../../../core/services/toast.service';

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
  templateUrl: './tariffs-list.page.html',
  styleUrl: './tariffs-list.page.scss',
})
export class TariffsListPageComponent implements OnInit {
  protected readonly tariffs = signal<TariffEntity[]>([]);
  protected readonly tableState = signal<TableState>('loading');
  protected readonly pagination = signal<PaginationMeta | null>(null);
  protected readonly sort = signal<SortParams | null>(null);

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
    private readonly toast: ToastService,
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
        (f) => this.toast.error(this.failureMsg(f)),
        () => { this.toast.success('Tarifa creada exitosamente'); this.load(); },
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
        (f) => this.toast.error(this.failureMsg(f)),
        () => { this.toast.success('Tarifa actualizada'); this.load(); },
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
        (f) => this.toast.error(this.failureMsg(f)),
        () => { this.toast.success('Tarifa desactivada'); this.load(); },
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
