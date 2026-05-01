import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { VEHICLE_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import { VehicleRepository, CreateVehicleParams, ListVehiclesParams, UpdateVehicleParams } from '../../domain/repositories/vehicle.repository';
import { VehicleDataSource } from '../datasources/vehicle.datasource';

@Injectable()
export class VehicleRepositoryImpl extends VehicleRepository {
  constructor(
    @Inject(VEHICLE_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: VehicleDataSource,
  ) { super(); }

  async list(params: ListVehiclesParams): Promise<Either<Failure, { data: VehicleEntity[]; pagination: PaginationMeta }>> {
    return this.remoteDs.list(params);
  }

  async findById(id: string): Promise<Either<Failure, VehicleEntity>> {
    return this.remoteDs.findById(id);
  }

  async create(params: CreateVehicleParams): Promise<Either<Failure, VehicleEntity>> {
    return this.remoteDs.create(params);
  }

  async update(params: UpdateVehicleParams): Promise<Either<Failure, VehicleEntity>> {
    return this.remoteDs.update(params);
  }

  async deactivate(id: string): Promise<Either<Failure, void>> {
    return this.remoteDs.deactivate(id);
  }

  async existsByPlate(plate: string): Promise<Either<Failure, boolean>> {
    return this.remoteDs.existsByPlate(plate);
  }

  async hasActiveSession(plate: string): Promise<Either<Failure, boolean>> {
    return this.remoteDs.hasActiveSession(plate);
  }

  async hasActivePlan(plate: string): Promise<Either<Failure, boolean>> {
    return this.remoteDs.hasActivePlan(plate);
  }
}
