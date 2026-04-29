import { InjectionToken } from '@angular/core';
import type { AuthRepository } from '../../features/auth/domain/repositories/auth.repository';
import type { AuthDataSource } from '../../features/auth/data/datasources/auth.datasource';
import type { LoginUseCase } from '../../features/auth/domain/usecases/login.usecase';
import type { LogoutUseCase } from '../../features/auth/domain/usecases/logout.usecase';
import type { RestoreSessionUseCase } from '../../features/auth/domain/usecases/restore-session.usecase';
import type { ParkingRepository } from '../../features/parking/domain/repositories/parking.repository';
import type { ParkingDataSource } from '../../features/parking/data/datasources/parking.datasource';
import type { RegisterVehicleEntryUseCase } from '../../features/parking/domain/usecases/register-vehicle-entry.usecase';
import type { SearchVehicleByPlateUseCase } from '../../features/parking/domain/usecases/search-vehicle-by-plate.usecase';

// ── Auth ────────────────────────────────────────────────────────────────────
export const AUTH_REPOSITORY_TOKEN = new InjectionToken<AuthRepository>('AuthRepository');
export const AUTH_DATASOURCE_TOKEN = new InjectionToken<AuthDataSource>('AuthDataSource');
export const LOGIN_USECASE_TOKEN = new InjectionToken<LoginUseCase>('LoginUseCase');
export const LOGOUT_USECASE_TOKEN = new InjectionToken<LogoutUseCase>('LogoutUseCase');
export const RESTORE_SESSION_USECASE_TOKEN = new InjectionToken<RestoreSessionUseCase>('RestoreSessionUseCase');

// ── Parking ─────────────────────────────────────────────────────────────────
export const PARKING_REPOSITORY_TOKEN = new InjectionToken<ParkingRepository>('ParkingRepository');
export const PARKING_REMOTE_DATASOURCE_TOKEN = new InjectionToken<ParkingDataSource>('ParkingRemoteDataSource');
export const PARKING_LOCAL_DATASOURCE_TOKEN = new InjectionToken<ParkingDataSource>('ParkingLocalDataSource');
export const REGISTER_VEHICLE_ENTRY_TOKEN = new InjectionToken<RegisterVehicleEntryUseCase>('RegisterVehicleEntryUseCase');
export const SEARCH_VEHICLE_BY_PLATE_TOKEN = new InjectionToken<SearchVehicleByPlateUseCase>('SearchVehicleByPlateUseCase');
