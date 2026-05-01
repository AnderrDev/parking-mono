import { Routes } from '@angular/router';
import {
  TARIFF_REPOSITORY_TOKEN,
  TARIFF_REMOTE_DATASOURCE_TOKEN,
  LIST_TARIFFS_TOKEN,
  CREATE_TARIFF_TOKEN,
  UPDATE_TARIFF_TOKEN,
  DEACTIVATE_TARIFF_TOKEN,
} from '../../core/di/injection-tokens';
import { TariffRemoteDataSource } from './data/datasources/tariff-remote.datasource';
import { TariffRepositoryImpl } from './data/repositories/tariff.repository.impl';
import { ListTariffsUseCase } from './domain/usecases/list-tariffs.usecase';
import { CreateTariffUseCase } from './domain/usecases/create-tariff.usecase';
import { UpdateTariffUseCase } from './domain/usecases/update-tariff.usecase';
import { DeactivateTariffUseCase } from './domain/usecases/deactivate-tariff.usecase';

const tariffProviders = [
  { provide: TARIFF_REMOTE_DATASOURCE_TOKEN, useClass: TariffRemoteDataSource },
  { provide: TARIFF_REPOSITORY_TOKEN, useClass: TariffRepositoryImpl },
  { provide: LIST_TARIFFS_TOKEN, useClass: ListTariffsUseCase },
  { provide: CREATE_TARIFF_TOKEN, useClass: CreateTariffUseCase },
  { provide: UPDATE_TARIFF_TOKEN, useClass: UpdateTariffUseCase },
  { provide: DEACTIVATE_TARIFF_TOKEN, useClass: DeactivateTariffUseCase },
];

export const tariffsRoutes: Routes = [
  {
    path: '',
    providers: tariffProviders,
    loadComponent: () =>
      import('./presentation/pages/tariffs-list.page').then((m) => m.TariffsListPageComponent),
  },
];
