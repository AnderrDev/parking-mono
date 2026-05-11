import { Inject, Injectable } from '@angular/core';
import { Either, right } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PARKING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { normalizePlate } from '../../../../shared/utils/plate.utils';
import { ParkingRepository } from '../repositories/parking.repository';
import { VehicleEntity } from '../entities/vehicle.entity';

export interface SearchPlateSuggestionsParams {
  query: string;
  limit?: number;
  /**
   * Si es true, restringe el resultado a placas con sesión actualmente
   * activa en el parqueadero (uso primario: vista del operador). Default false.
   */
  onlyActive?: boolean;
}

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 8;

@Injectable()
export class SearchPlateSuggestionsUseCase extends UseCase<
  SearchPlateSuggestionsParams,
  VehicleEntity[]
> {
  constructor(
    @Inject(PARKING_REPOSITORY_TOKEN) private readonly repo: ParkingRepository,
  ) {
    super();
  }

  async execute(
    params: SearchPlateSuggestionsParams,
  ): Promise<Either<Failure, VehicleEntity[]>> {
    const normalized = normalizePlate(params.query);
    if (normalized.length < MIN_QUERY_LENGTH) {
      return right([]);
    }
    return this.repo.searchPlateSuggestions(
      normalized,
      params.limit ?? DEFAULT_LIMIT,
      params.onlyActive ?? false,
    );
  }
}
