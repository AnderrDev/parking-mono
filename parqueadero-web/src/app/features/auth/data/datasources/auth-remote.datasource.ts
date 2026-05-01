import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import {
  Failure,
  NetworkFailure,
  ServerFailure,
  UnauthorizedFailure,
} from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { UserEntity } from '../../domain/entities/user.entity';
import { UserMapper, UserModel } from '../models/user.model';
import { AuthDataSource } from './auth.datasource';

@Injectable()
export class AuthRemoteDataSource extends AuthDataSource {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async signIn(email: string, password: string): Promise<Either<Failure, UserEntity>> {
    try {
      const { data, error } = await this.supabase.client.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.status === 0 || error.message?.toLowerCase().includes('network')) {
          return left(new NetworkFailure());
        }
        if (error.status === 400 || error.status === 401) {
          return left(new UnauthorizedFailure('Credenciales incorrectas'));
        }
        return left(new ServerFailure(error.message, error.status));
      }

      if (!data.session || !data.user) {
        return left(new ServerFailure('No se recibió sesión de Supabase'));
      }

      const jwtPayload = this.decodeJwtPayload(data.session.access_token);
      if (!jwtPayload?.['user_role']) {
        return left(new ServerFailure('JWT sin claim user_role'));
      }

      const userRow = await this.fetchUserRow(data.user.id);
      if (!userRow) {
        return left(new ServerFailure('Usuario no encontrado en directorio'));
      }

      if (!userRow.is_active) {
        return left(new UnauthorizedFailure('Usuario inactivo. Contacta al administrador.'));
      }

      return right(UserMapper.toEntity(userRow));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async signOut(): Promise<Either<Failure, void>> {
    try {
      const { error } = await this.supabase.client.auth.signOut();
      if (error) {
        if (error.status === 0 || error.message?.toLowerCase().includes('network')) {
          return left(new NetworkFailure());
        }
        return left(new ServerFailure(error.message, error.status));
      }
      return right(undefined);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<Either<Failure, void>> {
    try {
      const { data: sessionData, error: sessionErr } = await this.supabase.client.auth.getSession();
      if (sessionErr) return left(new ServerFailure(sessionErr.message));
      if (!sessionData.session) return left(new UnauthorizedFailure('Sesión no activa'));

      const email = sessionData.session.user.email;
      if (!email) return left(new ServerFailure('Sesión sin email'));

      // 1. Re-verificar contraseña actual con sign-in adicional.
      const { error: signInErr } = await this.supabase.client.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signInErr) {
        if (signInErr.status === 400 || signInErr.status === 401) {
          return left(new UnauthorizedFailure('Contraseña actual incorrecta'));
        }
        return left(new ServerFailure(signInErr.message));
      }

      // 2. Actualizar contraseña.
      const { error: updateErr } = await this.supabase.client.auth.updateUser({
        password: newPassword,
      });
      if (updateErr) return left(new ServerFailure(updateErr.message));

      return right(undefined);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async getSession(): Promise<Either<Failure, UserEntity | null>> {
    try {
      const { data, error } = await this.supabase.client.auth.getSession();

      if (error) {
        return left(new ServerFailure(error.message));
      }

      if (!data.session) {
        return right(null);
      }

      const jwtPayload = this.decodeJwtPayload(data.session.access_token);
      if (!jwtPayload?.['user_role']) {
        return left(new ServerFailure('JWT restaurado sin claim user_role'));
      }

      const userRow = await this.fetchUserRow(data.session.user.id);
      if (!userRow) {
        return right(null);
      }

      return right(UserMapper.toEntity(userRow));
    } catch {
      return left(new NetworkFailure());
    }
  }

  private async fetchUserRow(userId: string): Promise<UserModel | null> {
    const { data } = await this.supabase.client
      .from('users')
      .select('id, email, role, nombre, is_active, created_at, updated_at')
      .eq('id', userId)
      .single<UserModel>();
    return data;
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.');
      const payloadBase64 = parts[1];
      if (!payloadBase64) return null;
      const decoded = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
