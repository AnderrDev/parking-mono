import { Routes } from '@angular/router';
import {
  AUTH_REPOSITORY_TOKEN,
  AUTH_DATASOURCE_TOKEN,
  LOGIN_USECASE_TOKEN,
  LOGOUT_USECASE_TOKEN,
  RESTORE_SESSION_USECASE_TOKEN,
} from '../../core/di/injection-tokens';
import { AuthRemoteDataSource } from './data/datasources/auth-remote.datasource';
import { AuthRepositoryImpl } from './data/repositories/auth.repository.impl';
import { LoginUseCase } from './domain/usecases/login.usecase';
import { LogoutUseCase } from './domain/usecases/logout.usecase';
import { RestoreSessionUseCase } from './domain/usecases/restore-session.usecase';

const authProviders = [
  { provide: AUTH_DATASOURCE_TOKEN, useClass: AuthRemoteDataSource },
  { provide: AUTH_REPOSITORY_TOKEN, useClass: AuthRepositoryImpl },
  { provide: LOGIN_USECASE_TOKEN, useClass: LoginUseCase },
  { provide: LOGOUT_USECASE_TOKEN, useClass: LogoutUseCase },
  { provide: RESTORE_SESSION_USECASE_TOKEN, useClass: RestoreSessionUseCase },
];

export const authRoutes: Routes = [
  {
    path: 'login',
    providers: authProviders,
    loadComponent: () =>
      import('./presentation/pages/login.page').then((m) => m.LoginPageComponent),
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
];
