import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { USER_ADMIN_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { UserAdminRepository } from '../repositories/user-admin.repository';

export interface ToggleUserActiveParams {
  userId: string;
  activate: boolean;
}

@Injectable()
export class ToggleUserActiveUseCase extends UseCase<ToggleUserActiveParams, void> {
  constructor(
    @Inject(USER_ADMIN_REPOSITORY_TOKEN) private readonly repo: UserAdminRepository,
  ) {
    super();
  }

  async execute(params: ToggleUserActiveParams): Promise<Either<Failure, void>> {
    return params.activate
      ? this.repo.activate(params.userId)
      : this.repo.deactivate(params.userId);
  }
}
