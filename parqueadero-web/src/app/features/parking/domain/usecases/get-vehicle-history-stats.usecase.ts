// UseCase: GetVehicleHistoryStatsUseCase
// Spec: parqueadero-web/specs/features/parking/get-vehicle-history-stats.spec.md
//
// Retorna las métricas históricas de una placa (sesiones cerradas) para
// alimentar el panel de dossier en el dashboard del operador.

import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PARKING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { isValidPlate, normalizePlate } from '../../../../shared/utils/plate.utils';
import { ParkingRepository } from '../repositories/parking.repository';
import { VehicleHistoryStats } from '../entities/vehicle-history-stats.entity';

export interface GetVehicleHistoryStatsParams {
  plate: string;
  recentLimit?: number;
}

@Injectable()
export class GetVehicleHistoryStatsUseCase extends UseCase<
  GetVehicleHistoryStatsParams,
  VehicleHistoryStats
> {
  constructor(
    @Inject(PARKING_REPOSITORY_TOKEN) private readonly repo: ParkingRepository,
  ) {
    super();
  }

  async execute(
    params: GetVehicleHistoryStatsParams,
  ): Promise<Either<Failure, VehicleHistoryStats>> {
    const normalized = normalizePlate(params.plate);
    if (!isValidPlate(normalized)) {
      return left(
        new ValidationFailure(
          `La placa ${params.plate} no cumple el formato esperado.`,
          'plate',
        ),
      );
    }
    return this.repo.getVehicleHistoryStats(normalized, params.recentLimit ?? 5);
  }
}
