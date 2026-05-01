import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { USER_ADMIN_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import {
  CreateUserParams,
  UserAdminRepository,
} from '../repositories/user-admin.repository';

@Injectable()
export class CreateUserUseCase extends UseCase<CreateUserParams, void> {
  constructor(
    @Inject(USER_ADMIN_REPOSITORY_TOKEN) private readonly repo: UserAdminRepository,
  ) {
    super();
  }

  async execute(params: CreateUserParams): Promise<Either<Failure, void>> {
    const email = params.email?.trim() ?? '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return left(new ValidationFailure('Email inválido', 'email'));
    }
    if (!params.password || params.password.length < 8) {
      return left(new ValidationFailure('La contraseña debe tener al menos 8 caracteres', 'password'));
    }
    const nombre = params.nombre?.trim() ?? '';
    if (nombre.length < 2) {
      return left(new ValidationFailure('El nombre es obligatorio', 'nombre'));
    }
    if (!['admin', 'operador', 'contador'].includes(params.role)) {
      return left(new ValidationFailure('Rol inválido', 'role'));
    }
    return this.repo.createUser({ ...params, email, nombre });
  }
}
