import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { UserEntity, UserRole } from '../../../auth/domain/entities/user.entity';
import { UserMapper, UserModel } from '../../../auth/data/models/user.model';
import {
  CreateUserParams,
  UserAdminRepository,
} from '../../domain/repositories/user-admin.repository';

@Injectable()
export class UserAdminRemoteDataSource extends UserAdminRepository {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async listUsers(includeInactive: boolean): Promise<Either<Failure, UserEntity[]>> {
    try {
      let query = this.supabase.client
        .from('users')
        .select('id, email, role, nombre, is_active, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query.returns<UserModel[]>();
      if (error) return left(new ServerFailure(error.message));
      return right((data ?? []).map((m) => UserMapper.toEntity(m)));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async createUser(params: CreateUserParams): Promise<Either<Failure, void>> {
    return this.invokeManageUsers({ action: 'create', ...params });
  }

  async updateRole(userId: string, role: UserRole): Promise<Either<Failure, void>> {
    return this.invokeManageUsers({ action: 'update-role', userId, role });
  }

  async deactivate(userId: string): Promise<Either<Failure, void>> {
    return this.invokeManageUsers({ action: 'deactivate', userId });
  }

  async activate(userId: string): Promise<Either<Failure, void>> {
    return this.invokeManageUsers({ action: 'activate', userId });
  }

  private async invokeManageUsers(body: Record<string, unknown>): Promise<Either<Failure, void>> {
    try {
      const { data, error } = await this.supabase.client.functions.invoke('manage-users', {
        body,
      });
      if (error) return left(new ServerFailure(error.message));
      if (data?.error) return left(new ServerFailure(data.error as string));
      return right(undefined);
    } catch {
      return left(new NetworkFailure());
    }
  }
}
