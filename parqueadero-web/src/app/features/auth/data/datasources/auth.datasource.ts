import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UserEntity } from '../../domain/entities/user.entity';

export abstract class AuthDataSource {
  abstract signIn(email: string, password: string): Promise<Either<Failure, UserEntity>>;
  abstract signOut(): Promise<Either<Failure, void>>;
  abstract getSession(): Promise<Either<Failure, UserEntity | null>>;
}
