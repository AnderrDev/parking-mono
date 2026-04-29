import { UserEntity, UserRole } from '../../domain/entities/user.entity';

export interface UserModel {
  id: string;
  email: string;
  role: string;
  nombre: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class UserMapper {
  static toEntity(model: UserModel): UserEntity {
    return new UserEntity(
      model.id,
      new Date(model.created_at),
      new Date(model.updated_at),
      model.email,
      model.role as UserRole,
      model.nombre,
      model.is_active,
    );
  }
}
