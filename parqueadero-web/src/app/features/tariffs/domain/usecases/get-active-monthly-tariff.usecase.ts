import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { TARIFF_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';
import { TariffRepository } from '../repositories/tariff.repository';

/**
 * Devuelve la tarifa activa de **mensualidad** para un tipo de vehículo,
 * o null si no hay configurada (en cuyo caso el operador debe ingresar
 * el monto manualmente al crear el plan).
 */
@Injectable()
export class GetActiveMonthlyTariffUseCase extends UseCase<VehicleType, TariffEntity | null> {
  constructor(
    @Inject(TARIFF_REPOSITORY_TOKEN) private readonly repo: TariffRepository,
  ) {
    super();
  }

  async execute(vehicleType: VehicleType): Promise<Either<Failure, TariffEntity | null>> {
    return this.repo.getActiveMonthlyTariff(vehicleType);
  }
}
