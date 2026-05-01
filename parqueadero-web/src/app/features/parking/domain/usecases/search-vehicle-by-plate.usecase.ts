import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PARKING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { normalizePlate } from '../../../../shared/utils/plate.utils';
import { ParkingRepository, VehicleSearchResult } from '../repositories/parking.repository';

export interface SearchVehicleByPlateParams {
  plate: string;
}

const MIN_QUERY_LENGTH = 2;

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
    // Búsqueda incremental: aceptamos fragmentos parciales (ej. "TPP") y dejamos que
    // el datasource haga match por inclusión. No exigimos formato completo ABC123/ABC12D
    // porque eso impedía buscar mientras se escribe.
    const normalized = normalizePlate(params.plate);

    if (normalized.length < MIN_QUERY_LENGTH) {
      return left(
        new ValidationFailure(
          `Escribe al menos ${MIN_QUERY_LENGTH} caracteres para buscar.`,
          'plate',
        ),
      );
    }

    return this.repo.searchVehicleByPlate(normalized);
  }
}
