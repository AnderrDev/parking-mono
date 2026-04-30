import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure, BusinessRuleFailure, NotFoundFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { VEHICLE_REPOSITORY_TOKEN, CUSTOMER_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { VehicleEntity } from '../../../parking/domain/entities/vehicle.entity';
import { CustomerRepository } from '../../../customers/domain/repositories/customer.repository';
import { VehicleRepository, CreateVehicleParams } from '../repositories/vehicle.repository';
import { isValidPlate, normalizePlate } from '../../../../shared/utils/plate.utils';

@Injectable()
export class CreateVehicleUseCase extends UseCase<CreateVehicleParams, VehicleEntity> {
  constructor(
    @Inject(VEHICLE_REPOSITORY_TOKEN) private readonly repo: VehicleRepository,
    @Inject(CUSTOMER_REPOSITORY_TOKEN) private readonly customerRepo: CustomerRepository,
  ) { super(); }

  async execute(params: CreateVehicleParams): Promise<Either<Failure, VehicleEntity>> {
    const plate = normalizePlate(params.plate);

    if (!isValidPlate(plate)) {
      return left(new ValidationFailure('Formato de placa inválido'));
    }
    if (params.color && params.color.length > 50) {
      return left(new ValidationFailure('El color no puede superar 50 caracteres'));
    }
    if (params.brand && params.brand.length > 50) {
      return left(new ValidationFailure('La marca no puede superar 50 caracteres'));
    }

    const exists = await this.repo.existsByPlate(plate);
    if (exists.isLeft()) return exists as Either<Failure, never>;
    if (exists.value) return left(new BusinessRuleFailure(`Ya existe un vehículo con placa ${plate}`));

    if (params.ownerCustomerId) {
      const customer = await this.customerRepo.findById(params.ownerCustomerId);
      if (customer.isLeft()) return customer as Either<Failure, never>;
      if (customer.value.isDeleted) return left(new NotFoundFailure('Cliente propietario no encontrado'));
    }

    return this.repo.create({ ...params, plate });
  }
}
