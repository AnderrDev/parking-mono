import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure, BusinessRuleFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { CUSTOMER_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { CustomerEntity } from '../entities/customer.entity';
import { CustomerRepository, CreateCustomerParams } from '../repositories/customer.repository';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(\+57)?[0-9]{10}$/;
const DOC_RE = /^[0-9X]{5,20}$/;

@Injectable()
export class CreateCustomerUseCase extends UseCase<CreateCustomerParams, CustomerEntity> {
  constructor(@Inject(CUSTOMER_REPOSITORY_TOKEN) private readonly repo: CustomerRepository) {
    super();
  }

  async execute(params: CreateCustomerParams): Promise<Either<Failure, CustomerEntity>> {
    if (!params.name || params.name.trim().length < 2 || params.name.trim().length > 200) {
      return left(new ValidationFailure('El nombre debe tener entre 2 y 200 caracteres'));
    }
    if (!DOC_RE.test(params.docNumber)) {
      return left(new ValidationFailure('El número de documento debe tener entre 5 y 20 caracteres (dígitos y letra X)'));
    }
    if (params.docType === 'nit' && (params.dv == null || params.dv < 0 || params.dv > 9)) {
      return left(new ValidationFailure('El dígito de verificación es obligatorio para NIT (0–9)'));
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

    const docExists = await this.repo.existsByDoc(params.docType, params.docNumber);
    if (docExists.isLeft()) return docExists as Either<Failure, never>;
    if (docExists.value) return left(new BusinessRuleFailure('Ya existe un cliente con ese documento'));

    if (params.email) {
      const emailExists = await this.repo.existsByEmail(params.email);
      if (emailExists.isLeft()) return emailExists as Either<Failure, never>;
      if (emailExists.value) return left(new BusinessRuleFailure('El email ya está registrado'));
    }

    return this.repo.create({
      ...params,
      responsabilidadesFiscales: params.responsabilidadesFiscales ?? ['R-99-PN'],
    });
  }
}
