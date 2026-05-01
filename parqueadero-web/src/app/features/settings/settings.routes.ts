import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { requireRole } from '../../core/guards/role.guard';
import {
  SETTINGS_DATASOURCE_TOKEN,
  SETTINGS_REPOSITORY_TOKEN,
  GET_SETTING_TOKEN,
  UPDATE_SETTING_TOKEN,
} from '../../core/di/injection-tokens';
import { SettingsRemoteDataSource } from './data/datasources/settings-remote.datasource';
import { SettingsRepositoryImpl } from './data/repositories/settings.repository.impl';
import { GetSettingUseCase } from './domain/usecases/get-setting.usecase';
import { UpdateSettingUseCase } from './domain/usecases/update-setting.usecase';

const settingsProviders = [
  { provide: SETTINGS_DATASOURCE_TOKEN, useClass: SettingsRemoteDataSource },
  { provide: SETTINGS_REPOSITORY_TOKEN, useClass: SettingsRepositoryImpl },
  { provide: GET_SETTING_TOKEN, useClass: GetSettingUseCase },
  { provide: UPDATE_SETTING_TOKEN, useClass: UpdateSettingUseCase },
];

export const settingsRoutes: Routes = [
  {
    path: '',
    providers: settingsProviders,
    canActivate: [authGuard, requireRole('admin')],
    loadComponent: () =>
      import('./presentation/pages/settings.page').then((m) => m.SettingsPageComponent),
    data: { title: 'Configuración' },
  },
];
