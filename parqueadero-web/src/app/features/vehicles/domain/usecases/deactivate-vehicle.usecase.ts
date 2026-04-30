import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, BusinessRuleFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { VEHICLE_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { VehicleRepository } from '../repositories/vehicle.repository';

export interface DeactivateVehicleParams { id: string; }

@Injectable()
export class DeactivateVehicleUseCase extends UseCase<DeactivateVehicleParams, void> {
  constructor(@Inject(VEHICLE_REPOSITORY_TOKEN) private readonly repo: VehicleRepository) {
    super();
  }

  async execute(params: DeactivateVehicleParams): Promise<Either<Failure, void>> {
    const existing = await this.repo.findById(params.id);
    if (existing.isLeft()) return existing as Either<Failure, never>;
    const vehicle = existing.value;
    if (vehicle.isDeleted) return left(new BusinessRuleFailure('El vehículo ya está desactivado'));

    const hasSession = await this.repo.hasActiveSession(vehicle.plate);
    if (hasSession.isLeft()) return hasSession as Either<Failure, never>;
    if (hasSession.value) return left(new BusinessRuleFailure('El vehículo tiene una sesión activa. Ciérrala antes de desactivar.'));

    const hasPlan = await this.repo.hasActivePlan(vehicle.plate);
    if (hasPlan.isLeft()) return hasPlan as Either<Failure, never>;
    if (hasPlan.value) return left(new BusinessRuleFailure('El vehículo tiene un plan mensual activo.'));

    return this.repo.deactivate(params.id);
  }
}
