import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PARKING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { ParkingRepository } from '../repositories/parking.repository';
import { TariffEntity } from '../entities/tariff.entity';
import { VehicleType } from '../entities/parking-session.entity';

@Injectable()
export class GetActiveTariffUseCase extends UseCase<VehicleType, TariffEntity> {
  constructor(
    @Inject(PARKING_REPOSITORY_TOKEN) private readonly repo: ParkingRepository,
  ) {
    super();
  }

  execute(vehicleType: VehicleType): Promise<Either<Failure, TariffEntity>> {
    return this.repo.getActiveTariff(vehicleType);
  }
}
