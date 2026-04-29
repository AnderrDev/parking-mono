import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UserEntity } from '../entities/user.entity';

export abstract class AuthRepository {
  abstract login(email: string, password: string): Promise<Either<Failure, UserEntity>>;
  abstract logout(): Promise<Either<Failure, void>>;
  abstract getCurrentUser(): Promise<Either<Failure, UserEntity | null>>;
}
