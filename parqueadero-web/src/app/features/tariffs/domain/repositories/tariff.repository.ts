import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { TariffEntity, TariffUnit, PlanTariffUnit } from '../../../parking/domain/entities/tariff.entity';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';
import { PaginatedResult, PaginationParams } from '../../../../shared/models/pagination.model';
import { SortParams } from '../../../../shared/models/sort.model';

export interface ListTariffsParams {
  vehicleType?: VehicleType | null;
  isActive?: boolean | null;
  pagination?: PaginationParams;
  sort?: SortParams;
}

export interface CreateTariffParams {
  name: string;
  vehicleType: VehicleType;
  unit: TariffUnit;
  // Legacy: aplica a mensualidad (precio mensual). Para parking se deriva
  // automáticamente desde perHourCents en el repositorio para back-compat.
  valueCents: number;
  graceMinutes: number;
  dailyCapCents: number;
  // Tiered pricing (S4). Requeridos cuando unit != 'mensualidad'. Para
  // mensualidad se ignoran.
  perMinuteCents?: number | null;
  perHourCents?: number | null;
  plenaCents?: number | null;
  scheduleJson?: Record<string, string>;
  validFrom?: Date | null;
  validTo?: Date | null;
}

export interface UpdateTariffParams {
  name?: string;
  valueCents?: number;
  graceMinutes?: number;
  dailyCapCents?: number;
  perMinuteCents?: number | null;
  perHourCents?: number | null;
  plenaCents?: number | null;
  scheduleJson?: Record<string, string>;
  validFrom?: Date | null;
  validTo?: Date | null;
  isActive?: boolean;
}

export abstract class TariffRepository {
  abstract list(params: ListTariffsParams): Promise<Either<Failure, PaginatedResult<TariffEntity>>>;
  abstract findById(id: string): Promise<Either<Failure, TariffEntity | null>>;
  abstract create(params: CreateTariffParams): Promise<Either<Failure, TariffEntity>>;
  abstract update(id: string, params: UpdateTariffParams): Promise<Either<Failure, TariffEntity>>;
  abstract deactivate(id: string): Promise<Either<Failure, void>>;
  abstract existsActive(name: string, vehicleType: VehicleType, excludeId?: string): Promise<Either<Failure, boolean>>;

  /**
   * Devuelve true si ya hay otra tarifa activa para el mismo `vehicleType`
   * en la misma categoría que `unit`. Evita tarifas duplicadas, que harían
   * que el sistema tomara "cualquiera" al cobrar.
   *
   * Las categorías son: rotación (todas las unidades de tiempo compiten
   * entre sí, solo puede haber una activa por tipo) y cada unidad de plan
   * por separado — mensualidad y quincena son productos distintos y ambos
   * pueden estar activos a la vez para el mismo tipo de vehículo.
   */
  abstract existsActiveSameCategory(
    vehicleType: VehicleType,
    unit: TariffUnit,
    excludeId?: string,
  ): Promise<Either<Failure, boolean>>;

  /**
   * Tarifa activa de un plan prepagado (mensualidad o quincena) para un
   * tipo de vehículo. Null si no hay configurada, en cuyo caso quien vende
   * digita el valor a mano.
   */
  abstract getActivePlanTariff(
    vehicleType: VehicleType,
    unit: PlanTariffUnit,
  ): Promise<Either<Failure, TariffEntity | null>>;
}
