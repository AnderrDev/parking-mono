import { Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { CacheFailure, Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import { CreateVehicleParams, ListVehiclesParams, UpdateVehicleParams } from '../../domain/repositories/vehicle.repository';
import { VehicleDataSource } from './vehicle.datasource';

@Injectable()
export class VehicleLocalDataSource extends VehicleDataSource {
  private stub(): Either<Failure, never> {
    return left(new CacheFailure('Local datasource no disponible hasta Fase 8'));
  }

  list(_p: ListVehiclesParams): Promise<Either<Failure, { data: VehicleEntity[]; pagination: PaginationMeta }>> {
    return Promise.resolve(this.stub());
  }
  findById(_id: string): Promise<Either<Failure, VehicleEntity>> { return Promise.resolve(this.stub()); }
  create(_p: CreateVehicleParams): Promise<Either<Failure, VehicleEntity>> { return Promise.resolve(this.stub()); }
  update(_p: UpdateVehicleParams): Promise<Either<Failure, VehicleEntity>> { return Promise.resolve(this.stub()); }
  deactivate(_id: string): Promise<Either<Failure, void>> { return Promise.resolve(this.stub()); }
  existsByPlate(_plate: string): Promise<Either<Failure, boolean>> { return Promise.resolve(this.stub()); }
  hasActiveSession(_plate: string): Promise<Either<Failure, boolean>> { return Promise.resolve(this.stub()); }
  hasActivePlan(_plate: string): Promise<Either<Failure, boolean>> { return Promise.resolve(this.stub()); }
}
