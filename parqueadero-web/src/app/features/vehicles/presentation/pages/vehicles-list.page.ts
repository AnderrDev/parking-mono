import {
  ChangeDetectionStrategy, Component, EnvironmentInjector, Inject, OnInit, ViewContainerRef, inject, signal,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';
import { DataTableComponent, TableColumn, TableState } from '../../../../shared/components/data-table/data-table.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ListVehiclesUseCase } from '../../domain/usecases/list-vehicles.usecase';
import { CreateVehicleUseCase } from '../../domain/usecases/create-vehicle.usecase';
import { UpdateVehicleUseCase } from '../../domain/usecases/update-vehicle.usecase';
import { DeactivateVehicleUseCase } from '../../domain/usecases/deactivate-vehicle.usecase';
import {
  LIST_VEHICLES_TOKEN, CREATE_VEHICLE_TOKEN, UPDATE_VEHICLE_TOKEN, DEACTIVATE_VEHICLE_TOKEN,
} from '../../../../core/di/injection-tokens';
import {
  VehicleEditDialogComponent, VehicleDialogData, VehicleFormValue,
} from '../components/vehicle-edit-dialog.component';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { SortParams } from '../../../../shared/models/sort.model';
import {
  Failure, BusinessRuleFailure, NetworkFailure, NotFoundFailure, ServerFailure, ValidationFailure,
} from '../../../../core/either/failures';
import { ToastService } from '../../../../core/services/toast.service';

const COLUMNS: TableColumn<VehicleEntity>[] = [
  { key: 'plate', label: 'Placa', sortable: true },
  { key: 'vehicleType', label: 'Tipo', sortable: true },
  { key: 'color', label: 'Color', sortable: false },
  { key: 'brand', label: 'Marca', sortable: false },
  { key: 'ownerCustomerId', label: 'Propietario (ID)', sortable: false },
  { key: '_actions', label: 'Acciones', sortable: false },
];

const VEHICLE_LABEL: Record<string, string> = {
  carro: 'Carro', moto: 'Moto', bicicleta: 'Bicicleta', otro: 'Otro',
};

@Component({
  selector: 'app-vehicles-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent],
  templateUrl: './vehicles-list.page.html',
  styleUrl: './vehicles-list.page.scss',
})
export class VehiclesListPageComponent implements OnInit {
  protected readonly vehicles = signal<VehicleEntity[]>([]);
  protected readonly tableState = signal<TableState>('loading');
  protected readonly pagination = signal<PaginationMeta | null>(null);
  protected readonly sort = signal<SortParams | null>(null);
  private currentPage = 1;
  private searchTerm: string | null = null;
  private filterType: VehicleType | null = null;
  private showDeleted = false;

  protected readonly columns = COLUMNS;

  constructor(
    @Inject(LIST_VEHICLES_TOKEN) private readonly listUC: ListVehiclesUseCase,
    @Inject(CREATE_VEHICLE_TOKEN) private readonly createUC: CreateVehicleUseCase,
    @Inject(UPDATE_VEHICLE_TOKEN) private readonly updateUC: UpdateVehicleUseCase,
    @Inject(DEACTIVATE_VEHICLE_TOKEN) private readonly deactivateUC: DeactivateVehicleUseCase,
    private readonly dialog: Dialog,
    private readonly toast: ToastService,
    /** Anclar overlay del dialog. */
    private readonly vcr: ViewContainerRef,
  ) {}

  /** EnvironmentInjector del route para que el dialog vea providers route-scoped (ver operator-dashboard.page.ts). */
  private readonly envInjector = inject(EnvironmentInjector);

  ngOnInit(): void { this.load(); }

  protected typeLabel(t: string): string { return VEHICLE_LABEL[t] ?? t; }

  async load(): Promise<void> {
    this.tableState.set('loading');
    const s = this.sort();
    const result = await this.listUC.execute({
      search: this.searchTerm,
      vehicleType: this.filterType,
      includeDeleted: this.showDeleted,
      pagination: { page: this.currentPage, pageSize: 25 },
      ...(s ? { sort: s } : {}),
    });
    result.fold(
      (_f) => this.tableState.set('error'),
      ({ data, pagination }) => {
        this.vehicles.set(data);
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

  protected onTypeFilter(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.filterType = val ? val as VehicleType : null;
    this.currentPage = 1;
    this.load();
  }

  protected onShowDeleted(event: Event): void {
    this.showDeleted = (event.target as HTMLInputElement).checked;
    this.currentPage = 1;
    this.load();
  }

  protected onSort(s: SortParams): void { this.sort.set(s); this.currentPage = 1; this.load(); }
  protected onPage(page: number): void { this.currentPage = page; this.load(); }

  protected openCreate(): void {
    const ref = this.dialog.open<VehicleFormValue | null>(VehicleEditDialogComponent, {
      injector: this.envInjector,
      viewContainerRef: this.vcr,
      data: {
        vehicle: null,
        onSubmit: async (value) => {
          const result = await this.createUC.execute({
            plate: value.plate,
            vehicleType: value.vehicleType as VehicleType,
            color: value.color || null,
            brand: value.brand || null,
            ownerCustomerId: value.ownerCustomerId || null,
          });
          return result.fold((f) => this.failureMsg(f), () => null);
        },
      } satisfies VehicleDialogData,
    });
    ref.closed.subscribe((value) => {
      if (!value) return;
      this.toast.success('Vehículo registrado exitosamente');
      this.load();
    });
  }

  protected openEdit(vehicle: VehicleEntity): void {
    const ref = this.dialog.open<VehicleFormValue | null>(VehicleEditDialogComponent, {
      injector: this.envInjector,
      viewContainerRef: this.vcr,
      data: {
        vehicle,
        onSubmit: async (value) => {
          const result = await this.updateUC.execute({
            id: vehicle.id,
            color: value.color || null,
            brand: value.brand || null,
            ownerCustomerId: value.ownerCustomerId || null,
          });
          return result.fold((f) => this.failureMsg(f), () => null);
        },
      } satisfies VehicleDialogData,
    });
    ref.closed.subscribe((value) => {
      if (!value) return;
      this.toast.success('Vehículo actualizado');
      this.load();
    });
  }

  protected confirmDeactivate(vehicle: VehicleEntity): void {
    const ref = this.dialog.open<boolean>(ConfirmDialogComponent, {
      injector: this.envInjector,
      viewContainerRef: this.vcr,
      data: {
        title: 'Desactivar vehículo',
        message: `¿Desactivar el vehículo con placa ${vehicle.plate}?`,
        confirmLabel: 'Desactivar',
        variant: 'danger',
      } satisfies ConfirmDialogData,
    });
    ref.closed.subscribe(async (confirmed) => {
      if (!confirmed) return;
      const result = await this.deactivateUC.execute({ id: vehicle.id });
      result.fold(
        (f) => this.toast.error(this.failureMsg(f)),
        () => { this.toast.success('Vehículo desactivado'); this.load(); },
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
