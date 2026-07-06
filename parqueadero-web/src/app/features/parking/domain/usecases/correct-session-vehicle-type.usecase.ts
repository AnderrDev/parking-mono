import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PARKING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import {
  CorrectSessionVehicleTypeParams,
  ParkingRepository,
} from '../repositories/parking.repository';
import { ParkingSessionEntity, VehicleType } from '../entities/parking-session.entity';
import { normalizePlate } from '../../../../shared/utils/plate.utils';

const ALLOWED_TYPES: readonly VehicleType[] = ['carro', 'moto', 'bicicleta', 'otro'];

@Injectable()
export class CorrectSessionVehicleTypeUseCase extends UseCase<
  CorrectSessionVehicleTypeParams,
  ParkingSessionEntity
> {
  constructor(
    @Inject(PARKING_REPOSITORY_TOKEN) private readonly repo: ParkingRepository,
  ) {
    super();
  }

  execute(
    params: CorrectSessionVehicleTypeParams,
  ): Promise<Either<Failure, ParkingSessionEntity>> {
    if (!params.sessionId) {
      return Promise.resolve(left(new ValidationFailure('sessionId es requerido', 'sessionId')));
    }

    const plate = normalizePlate(params.plate ?? '');
    if (!plate) {
      return Promise.resolve(left(new ValidationFailure('La placa es obligatoria', 'plate')));
    }

    if (!ALLOWED_TYPES.includes(params.vehicleType)) {
      return Promise.resolve(left(new ValidationFailure('Tipo de vehículo inválido', 'vehicleType')));
    }

    if (!params.userId) {
      return Promise.resolve(left(new ValidationFailure('Usuario requerido', 'userId')));
    }

    return this.repo.correctSessionVehicleType({
      ...params,
      plate,
    });
  }
}
