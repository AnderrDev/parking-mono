import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase, NoParams } from '../../../../core/base/usecase';
import { AUTH_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { AuthRepository } from '../repositories/auth.repository';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class RestoreSessionUseCase extends UseCase<NoParams, UserEntity | null> {
  constructor(
    @Inject(AUTH_REPOSITORY_TOKEN) private readonly authRepository: AuthRepository,
  ) {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_params: NoParams): Promise<Either<Failure, UserEntity | null>> {
    return this.authRepository.getCurrentUser();
  }
}
