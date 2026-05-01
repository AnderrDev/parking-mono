import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { USER_ADMIN_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { UserEntity, UserRole } from '../../../auth/domain/entities/user.entity';
import {
  CreateUserParams,
  UserAdminRepository,
} from '../../domain/repositories/user-admin.repository';

@Injectable()
export class UserAdminRepositoryImpl extends UserAdminRepository {
  constructor(
    @Inject(USER_ADMIN_DATASOURCE_TOKEN) private readonly ds: UserAdminRepository,
  ) {
    super();
  }

  async listUsers(includeInactive: boolean): Promise<Either<Failure, UserEntity[]>> {
    return this.ds.listUsers(includeInactive);
  }
  async createUser(params: CreateUserParams): Promise<Either<Failure, void>> {
    return this.ds.createUser(params);
  }
  async updateRole(userId: string, role: UserRole): Promise<Either<Failure, void>> {
    return this.ds.updateRole(userId, role);
  }
  async deactivate(userId: string): Promise<Either<Failure, void>> {
    return this.ds.deactivate(userId);
  }
  async activate(userId: string): Promise<Either<Failure, void>> {
    return this.ds.activate(userId);
  }
}
