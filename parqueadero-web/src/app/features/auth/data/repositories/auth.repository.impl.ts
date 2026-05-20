import { Inject, Injectable } from '@angular/core';
import { Either, right } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { AUTH_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { AuthStateService } from '../../../../core/services/auth-state.service';
import { LocalDbService } from '../../../../core/services/local-db.service';
import { SyncOrchestrator } from '../../../../core/services/sync-orchestrator.service';
import { AuthRepository } from '../../domain/repositories/auth.repository';
import { UserEntity } from '../../domain/entities/user.entity';
import { AuthDataSource } from '../datasources/auth.datasource';

@Injectable()
export class AuthRepositoryImpl extends AuthRepository {
  constructor(
    @Inject(AUTH_DATASOURCE_TOKEN) private readonly dataSource: AuthDataSource,
    private readonly authState: AuthStateService,
    private readonly localDb: LocalDbService,
    private readonly syncOrchestrator: SyncOrchestrator,
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
    // Per spec: local session is always cleared, regardless of remote result.
    // Fase 8: limpiar primero la base local offline para que el siguiente
    // usuario no vea datos del operador anterior.
    // Sprint 3: notificar a las demás pestañas antes de borrar la base —
    // les permite detectar el cierre de sesión sin esperar al evento de
    // auth-state (que sólo propaga a la pestaña actual).
    try {
      this.syncOrchestrator.notifyLogout();
    } catch (err) {
      console.warn('[logout] notifyLogout falló', err);
    }
    try {
      await this.localDb.clear();
    } catch (err) {
      // No bloqueamos el logout si la base local falla.
      console.error('[logout] error limpiando base local', err);
    }
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
