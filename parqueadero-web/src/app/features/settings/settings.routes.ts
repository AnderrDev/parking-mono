import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { requireRole } from '../../core/guards/role.guard';
import { UPDATE_SETTING_TOKEN } from '../../core/di/injection-tokens';
import { UpdateSettingUseCase } from './domain/usecases/update-setting.usecase';

// SETTINGS_DATASOURCE_TOKEN, SETTINGS_REPOSITORY_TOKEN y GET_SETTING_TOKEN
// están en app.config.ts (root) porque reports/payments/cashier los consumen
// y romperían DI si quedaran route-scoped a /settings.
const settingsProviders = [
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
