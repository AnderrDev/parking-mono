import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { VEHICLE_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import { VehicleRepository, ListVehiclesParams } from '../repositories/vehicle.repository';

export interface ListVehiclesResult { data: VehicleEntity[]; pagination: PaginationMeta }

@Injectable()
export class ListVehiclesUseCase extends UseCase<ListVehiclesParams, ListVehiclesResult> {
  constructor(@Inject(VEHICLE_REPOSITORY_TOKEN) private readonly repo: VehicleRepository) {
    super();
  }

  async execute(params: ListVehiclesParams): Promise<Either<Failure, ListVehiclesResult>> {
    const page = params.pagination?.page ?? 1;
    const pageSize = params.pagination?.pageSize ?? 25;
    if (page < 1) return left(new ValidationFailure('La página debe ser ≥ 1'));
    if (pageSize < 10 || pageSize > 100) return left(new ValidationFailure('El tamaño de página debe estar entre 10 y 100'));
    return this.repo.list(params);
  }
}
