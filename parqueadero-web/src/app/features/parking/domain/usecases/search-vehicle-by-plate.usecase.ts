import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PARKING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { normalizePlate, isValidPlate } from '../../../../shared/utils/plate.utils';
import { ParkingRepository, VehicleSearchResult } from '../repositories/parking.repository';

export interface SearchVehicleByPlateParams {
  plate: string;
}

@Injectable()
export class SearchVehicleByPlateUseCase extends UseCase<
  SearchVehicleByPlateParams,
  VehicleSearchResult
> {
  constructor(
    @Inject(PARKING_REPOSITORY_TOKEN) private readonly repo: ParkingRepository,
  ) {
    super();
  }

  async execute(
    params: SearchVehicleByPlateParams,
  ): Promise<Either<Failure, VehicleSearchResult>> {
    const normalized = normalizePlate(params.plate);

    if (!normalized || !isValidPlate(normalized)) {
      return left(
        new ValidationFailure(
          `Placa ${params.plate} no cumple el formato colombiano esperado (ABC123 o ABC12D).`,
          'plate',
        ),
      );
    }

    return this.repo.searchVehicleByPlate(normalized);
  }
}
