import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UserEntity, UserRole } from '../../../auth/domain/entities/user.entity';

export interface CreateUserParams {
  email: string;
  password: string;
  nombre: string;
  role: UserRole;
}

export abstract class UserAdminRepository {
  abstract listUsers(includeInactive: boolean): Promise<Either<Failure, UserEntity[]>>;
  abstract createUser(params: CreateUserParams): Promise<Either<Failure, void>>;
  abstract updateRole(userId: string, role: UserRole): Promise<Either<Failure, void>>;
  abstract deactivate(userId: string): Promise<Either<Failure, void>>;
  abstract activate(userId: string): Promise<Either<Failure, void>>;
}
