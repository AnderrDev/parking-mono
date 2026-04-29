import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { AUTH_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { AuthRepository } from '../repositories/auth.repository';
import { UserEntity } from '../entities/user.entity';

export interface LoginParams {
  email: string;
  password: string;
}

@Injectable()
export class LoginUseCase extends UseCase<LoginParams, UserEntity> {
  constructor(
    @Inject(AUTH_REPOSITORY_TOKEN) private readonly authRepository: AuthRepository,
  ) {
    super();
  }

  async execute(params: LoginParams): Promise<Either<Failure, UserEntity>> {
    const emailTrimmed = params.email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailTrimmed || !emailRegex.test(emailTrimmed)) {
      return left(new ValidationFailure('Email inválido', 'email'));
    }

    if (!params.password || params.password.length < 6) {
      return left(new ValidationFailure('La contraseña debe tener al menos 6 caracteres', 'password'));
    }

    return this.authRepository.login(emailTrimmed, params.password);
  }
}
