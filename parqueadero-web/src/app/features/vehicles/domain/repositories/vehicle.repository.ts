import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { SortParams } from '../../../../shared/models/sort.model';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';

export interface ListVehiclesParams {
  search?: string | null;
  vehicleType?: VehicleType | null;
  customerId?: string | null;
  includeDeleted?: boolean;
  pagination?: { page: number; pageSize: number };
  sort?: SortParams;
}

export interface CreateVehicleParams {
  plate: string;
  vehicleType: VehicleType;
  color?: string | null;
  brand?: string | null;
  ownerCustomerId?: string | null;
}

export interface UpdateVehicleParams {
  id: string;
  color?: string | null;
  brand?: string | null;
  ownerCustomerId?: string | null;
}

export abstract class VehicleRepository {
  abstract list(params: ListVehiclesParams): Promise<Either<Failure, { data: VehicleEntity[]; pagination: PaginationMeta }>>;
  abstract findById(id: string): Promise<Either<Failure, VehicleEntity>>;
  abstract create(params: CreateVehicleParams): Promise<Either<Failure, VehicleEntity>>;
  abstract update(params: UpdateVehicleParams): Promise<Either<Failure, VehicleEntity>>;
  abstract deactivate(id: string): Promise<Either<Failure, void>>;
  abstract existsByPlate(plate: string): Promise<Either<Failure, boolean>>;
  abstract hasActiveSession(plate: string): Promise<Either<Failure, boolean>>;
  abstract hasActivePlan(plate: string): Promise<Either<Failure, boolean>>;
}
