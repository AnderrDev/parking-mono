import { Inject, Injectable } from '@angular/core';
import { Either, right } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { AUTH_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { AuthStateService } from '../../../../core/services/auth-state.service';
import { AuthRepository } from '../../domain/repositories/auth.repository';
import { UserEntity } from '../../domain/entities/user.entity';
import { AuthDataSource } from '../datasources/auth.datasource';

@Injectable()
export class AuthRepositoryImpl extends AuthRepository {
  constructor(
    @Inject(AUTH_DATASOURCE_TOKEN) private readonly dataSource: AuthDataSource,
    private readonly authState: AuthStateService,
  ) {
    super();
  }

  async login(email: string, password: string): Promise<Either<Failure, UserEntity>> {
    const result = await this.dataSource.signIn(email, password);
    result.fold(
      () => undefined,
      (user) => this.authState.setUser(user),
    );
    return result;
  }

  async logout(): Promise<Either<Failure, void>> {
    await this.dataSource.signOut();
    this.authState.clear();
    return right(undefined);
  }

  async getCurrentUser(): Promise<Either<Failure, UserEntity | null>> {
    const result = await this.dataSource.getSession();
    result.fold(
      () => this.authState.clear(),
      (user) => {
        if (user) {
          this.authState.setUser(user);
        } else {
          this.authState.clear();
        }
      },
    );
    return result;
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<Either<Failure, void>> {
    return this.dataSource.changePassword(currentPassword, newPassword);
  }
}
