import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { requireRole } from '../../core/guards/role.guard';
import {
  USER_ADMIN_DATASOURCE_TOKEN,
  USER_ADMIN_REPOSITORY_TOKEN,
  LIST_USERS_TOKEN,
  CREATE_USER_TOKEN,
  UPDATE_USER_ROLE_TOKEN,
  TOGGLE_USER_ACTIVE_TOKEN,
} from '../../core/di/injection-tokens';
import { UserAdminRemoteDataSource } from './data/datasources/user-admin-remote.datasource';
import { UserAdminRepositoryImpl } from './data/repositories/user-admin.repository.impl';
import { ListUsersUseCase } from './domain/usecases/list-users.usecase';
import { CreateUserUseCase } from './domain/usecases/create-user.usecase';
import { UpdateUserRoleUseCase } from './domain/usecases/update-user-role.usecase';
import { ToggleUserActiveUseCase } from './domain/usecases/toggle-user-active.usecase';

const usersProviders = [
  { provide: USER_ADMIN_DATASOURCE_TOKEN, useClass: UserAdminRemoteDataSource },
  { provide: USER_ADMIN_REPOSITORY_TOKEN, useClass: UserAdminRepositoryImpl },
  { provide: LIST_USERS_TOKEN, useClass: ListUsersUseCase },
  { provide: CREATE_USER_TOKEN, useClass: CreateUserUseCase },
  { provide: UPDATE_USER_ROLE_TOKEN, useClass: UpdateUserRoleUseCase },
  { provide: TOGGLE_USER_ACTIVE_TOKEN, useClass: ToggleUserActiveUseCase },
];

export const usersRoutes: Routes = [
  {
    path: '',
    providers: usersProviders,
    canActivate: [authGuard, requireRole('admin')],
    loadComponent: () =>
      import('./presentation/pages/users-list.page').then((m) => m.UsersListPageComponent),
    data: { title: 'Usuarios' },
  },
];
