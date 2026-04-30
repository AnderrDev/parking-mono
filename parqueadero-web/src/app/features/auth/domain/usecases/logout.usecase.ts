import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase, NoParams } from '../../../../core/base/usecase';
import { AUTH_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { AuthRepository } from '../repositories/auth.repository';

@Injectable()
export class LogoutUseCase extends UseCase<NoParams, void> {
  constructor(
    @Inject(AUTH_REPOSITORY_TOKEN) private readonly authRepository: AuthRepository,
  ) {
    super();
  }

  async execute(_params: NoParams): Promise<Either<Failure, void>> {
    return this.authRepository.logout();
  }
}
