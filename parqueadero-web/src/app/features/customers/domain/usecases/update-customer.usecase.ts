import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure, BusinessRuleFailure, NotFoundFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { CUSTOMER_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { CustomerEntity } from '../entities/customer.entity';
import { CustomerRepository, UpdateCustomerParams } from '../repositories/customer.repository';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(\+57)?[0-9]{10}$/;

@Injectable()
export class UpdateCustomerUseCase extends UseCase<UpdateCustomerParams, CustomerEntity> {
  constructor(@Inject(CUSTOMER_REPOSITORY_TOKEN) private readonly repo: CustomerRepository) {
    super();
  }

  async execute(params: UpdateCustomerParams): Promise<Either<Failure, CustomerEntity>> {
    const existing = await this.repo.findById(params.id);
    if (existing.isLeft()) return existing as Either<Failure, never>;
    if (existing.value.isDeleted) return left(new NotFoundFailure('Cliente no encontrado'));

    if (params.name !== undefined) {
      const n = params.name.trim();
      if (n.length < 2 || n.length > 200) {
        return left(new ValidationFailure('El nombre debe tener entre 2 y 200 caracteres'));
      }
    }
    if (params.email && !EMAIL_RE.test(params.email)) {
      return left(new ValidationFailure('El email no tiene un formato válido'));
    }
    if (params.phone && !PHONE_RE.test(params.phone.replace(/\s/g, ''))) {
      return left(new ValidationFailure('El teléfono debe tener 10 dígitos o comenzar con +57'));
    }
    if (params.address && params.address.length > 200) {
      return left(new ValidationFailure('La dirección no puede superar 200 caracteres'));
    }
    if (params.municipio && params.municipio.length > 100) {
      return left(new ValidationFailure('El municipio no puede superar 100 caracteres'));
    }
    if (params.departamento && params.departamento.length > 100) {
      return left(new ValidationFailure('El departamento no puede superar 100 caracteres'));
    }

    if (params.email && params.email !== existing.value.email) {
      const emailExists = await this.repo.existsByEmail(params.email, params.id);
      if (emailExists.isLeft()) return emailExists as Either<Failure, never>;
      if (emailExists.value) return left(new BusinessRuleFailure('El email ya está en uso'));
    }

    return this.repo.update(params);
  }
}
