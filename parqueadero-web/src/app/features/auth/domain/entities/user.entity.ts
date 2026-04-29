import { BaseEntity } from '../../../../core/base/base.entity';

export type UserRole = 'admin' | 'operador' | 'contador';

export class UserEntity extends BaseEntity {
  constructor(
    id: string,
    createdAt: Date,
    updatedAt: Date,
    public readonly email: string,
    public readonly role: UserRole,
    public readonly nombre: string,
    public readonly isActive: boolean,
  ) {
    super(id, createdAt, updatedAt);
  }
}
