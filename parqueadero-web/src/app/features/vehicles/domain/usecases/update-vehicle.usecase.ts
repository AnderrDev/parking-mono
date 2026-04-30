import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure, NotFoundFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { VEHICLE_REPOSITORY_TOKEN, CUSTOMER_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import { CustomerRepository } from '../../../customers/domain/repositories/customer.repository';
import { VehicleRepository, UpdateVehicleParams } from '../repositories/vehicle.repository';

@Injectable()
export class UpdateVehicleUseCase extends UseCase<UpdateVehicleParams, VehicleEntity> {
  constructor(
    @Inject(VEHICLE_REPOSITORY_TOKEN) private readonly repo: VehicleRepository,
    @Inject(CUSTOMER_REPOSITORY_TOKEN) private readonly customerRepo: CustomerRepository,
  ) { super(); }

  async execute(params: UpdateVehicleParams): Promise<Either<Failure, VehicleEntity>> {
    const existing = await this.repo.findById(params.id);
    if (existing.isLeft()) return existing as Either<Failure, never>;
    if (existing.value.isDeleted) return left(new NotFoundFailure('Vehículo no encontrado'));

    if (params.color && params.color.length > 50) {
      return left(new ValidationFailure('El color no puede superar 50 caracteres'));
    }
    if (params.brand && params.brand.length > 50) {
      return left(new ValidationFailure('La marca no puede superar 50 caracteres'));
    }

    if (params.ownerCustomerId) {
      const customer = await this.customerRepo.findById(params.ownerCustomerId);
      if (customer.isLeft()) return customer as Either<Failure, never>;
      if (customer.value.isDeleted) return left(new NotFoundFailure('Cliente propietario no encontrado'));
    }

    return this.repo.update(params);
  }
}
