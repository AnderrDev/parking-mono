import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { AUTH_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { AuthRepository } from '../repositories/auth.repository';

export interface ChangePasswordParams {
  currentPassword: string;
  newPassword: string;
  confirmation: string;
}

@Injectable()
export class ChangePasswordUseCase extends UseCase<ChangePasswordParams, void> {
  constructor(
    @Inject(AUTH_REPOSITORY_TOKEN) private readonly authRepository: AuthRepository,
  ) {
    super();
  }

  async execute(params: ChangePasswordParams): Promise<Either<Failure, void>> {
    if (!params.currentPassword) {
      return left(new ValidationFailure('La contraseña actual es obligatoria', 'currentPassword'));
    }
    if (params.newPassword !== params.confirmation) {
      return left(new ValidationFailure('La nueva contraseña y su confirmación no coinciden', 'confirmation'));
    }
    if (params.newPassword.length < 8) {
      return left(new ValidationFailure('La nueva contraseña debe tener al menos 8 caracteres', 'newPassword'));
    }
    if (!/[A-Z]/.test(params.newPassword)) {
      return left(new ValidationFailure('La contraseña debe incluir al menos una mayúscula', 'newPassword'));
    }
    if (!/[a-z]/.test(params.newPassword)) {
      return left(new ValidationFailure('La contraseña debe incluir al menos una minúscula', 'newPassword'));
    }
    if (!/\d/.test(params.newPassword)) {
      return left(new ValidationFailure('La contraseña debe incluir al menos un número', 'newPassword'));
    }
    if (params.currentPassword === params.newPassword) {
      return left(new ValidationFailure('La nueva contraseña debe ser distinta a la actual', 'newPassword'));
    }

    return this.authRepository.changePassword(params.currentPassword, params.newPassword);
  }
}
