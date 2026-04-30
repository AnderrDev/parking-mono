import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { TariffEntity, TariffUnit } from '../../../parking/domain/entities/tariff.entity';
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
  valueCents: number;
  graceMinutes: number;
  dailyCapCents: number;
  scheduleJson?: Record<string, string>;
  validFrom?: Date | null;
  validTo?: Date | null;
}

export interface UpdateTariffParams {
  name?: string;
  valueCents?: number;
  graceMinutes?: number;
  dailyCapCents?: number;
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
}
