import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { TARIFF_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { PlanTariffUnit, TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';
import { TariffRepository } from '../repositories/tariff.repository';

export interface GetActivePlanTariffParams {
  vehicleType: VehicleType;
  /** `mensualidad` (30 días) o `quincena` (15 días). */
  unit: PlanTariffUnit;
}

/**
 * Devuelve la tarifa activa de un plan prepagado para un tipo de vehículo,
 * o null si no hay configurada — en ese caso quien vende digita el monto a
 * mano. Reemplaza a `GetActiveMonthlyTariffUseCase`, que asumía que el
 * único plan posible era la mensualidad.
 */
@Injectable()
export class GetActivePlanTariffUseCase
  extends UseCase<GetActivePlanTariffParams, TariffEntity | null> {
  constructor(
    @Inject(TARIFF_REPOSITORY_TOKEN) private readonly repo: TariffRepository,
  ) {
    super();
  }

  async execute(params: GetActivePlanTariffParams): Promise<Either<Failure, TariffEntity | null>> {
    return this.repo.getActivePlanTariff(params.vehicleType, params.unit);
  }
}
