import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { USER_ADMIN_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { UserEntity } from '../../../auth/domain/entities/user.entity';
import { UserAdminRepository } from '../repositories/user-admin.repository';

@Injectable()
export class ListUsersUseCase extends UseCase<{ includeInactive: boolean }, UserEntity[]> {
  constructor(
    @Inject(USER_ADMIN_REPOSITORY_TOKEN) private readonly repo: UserAdminRepository,
  ) {
    super();
  }

  async execute(params: { includeInactive: boolean }): Promise<Either<Failure, UserEntity[]>> {
    return this.repo.listUsers(params.includeInactive);
  }
}
