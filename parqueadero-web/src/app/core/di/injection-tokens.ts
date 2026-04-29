import { InjectionToken } from '@angular/core';
import type { AuthRepository } from '../../features/auth/domain/repositories/auth.repository';
import type { AuthDataSource } from '../../features/auth/data/datasources/auth.datasource';
import type { LoginUseCase } from '../../features/auth/domain/usecases/login.usecase';
import type { LogoutUseCase } from '../../features/auth/domain/usecases/logout.usecase';
import type { RestoreSessionUseCase } from '../../features/auth/domain/usecases/restore-session.usecase';

export const AUTH_REPOSITORY_TOKEN = new InjectionToken<AuthRepository>('AuthRepository');
export const AUTH_DATASOURCE_TOKEN = new InjectionToken<AuthDataSource>('AuthDataSource');
export const LOGIN_USECASE_TOKEN = new InjectionToken<LoginUseCase>('LoginUseCase');
export const LOGOUT_USECASE_TOKEN = new InjectionToken<LogoutUseCase>('LogoutUseCase');
export const RESTORE_SESSION_USECASE_TOKEN = new InjectionToken<RestoreSessionUseCase>('RestoreSessionUseCase');
