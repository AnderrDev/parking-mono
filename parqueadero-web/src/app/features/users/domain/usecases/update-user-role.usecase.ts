import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { USER_ADMIN_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { UserRole } from '../../../auth/domain/entities/user.entity';
import { UserAdminRepository } from '../repositories/user-admin.repository';

export interface UpdateUserRoleParams {
  userId: string;
  role: UserRole;
}

@Injectable()
export class UpdateUserRoleUseCase extends UseCase<UpdateUserRoleParams, void> {
  constructor(
    @Inject(USER_ADMIN_REPOSITORY_TOKEN) private readonly repo: UserAdminRepository,
  ) {
    super();
  }

  async execute(params: UpdateUserRoleParams): Promise<Either<Failure, void>> {
    return this.repo.updateRole(params.userId, params.role);
  }
}
