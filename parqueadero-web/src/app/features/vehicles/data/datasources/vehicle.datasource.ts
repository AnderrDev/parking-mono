import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import { CreateVehicleParams, ListVehiclesParams, UpdateVehicleParams } from '../../domain/repositories/vehicle.repository';

export abstract class VehicleDataSource {
  abstract list(params: ListVehiclesParams): Promise<Either<Failure, { data: VehicleEntity[]; pagination: PaginationMeta }>>;
  abstract findById(id: string): Promise<Either<Failure, VehicleEntity>>;
  abstract create(params: CreateVehicleParams): Promise<Either<Failure, VehicleEntity>>;
  abstract update(params: UpdateVehicleParams): Promise<Either<Failure, VehicleEntity>>;
  abstract deactivate(id: string): Promise<Either<Failure, void>>;
  abstract existsByPlate(plate: string): Promise<Either<Failure, boolean>>;
  abstract hasActiveSession(plate: string): Promise<Either<Failure, boolean>>;
  abstract hasActivePlan(plate: string): Promise<Either<Failure, boolean>>;
}
