import { Routes } from '@angular/router';
import {
  PARKING_REPOSITORY_TOKEN,
  PARKING_REMOTE_DATASOURCE_TOKEN,
  PARKING_LOCAL_DATASOURCE_TOKEN,
  REGISTER_VEHICLE_ENTRY_TOKEN,
  SEARCH_VEHICLE_BY_PLATE_TOKEN,
} from '../../core/di/injection-tokens';
import { ParkingRemoteDataSource } from './data/datasources/parking-remote.datasource';
import { ParkingLocalDataSource } from './data/datasources/parking-local.datasource';
import { ParkingRepositoryImpl } from './data/repositories/parking.repository.impl';
import { RegisterVehicleEntryUseCase } from './domain/usecases/register-vehicle-entry.usecase';
import { SearchVehicleByPlateUseCase } from './domain/usecases/search-vehicle-by-plate.usecase';

const parkingProviders = [
  { provide: PARKING_REMOTE_DATASOURCE_TOKEN, useClass: ParkingRemoteDataSource },
  { provide: PARKING_LOCAL_DATASOURCE_TOKEN, useClass: ParkingLocalDataSource },
  { provide: PARKING_REPOSITORY_TOKEN, useClass: ParkingRepositoryImpl },
  { provide: REGISTER_VEHICLE_ENTRY_TOKEN, useClass: RegisterVehicleEntryUseCase },
  { provide: SEARCH_VEHICLE_BY_PLATE_TOKEN, useClass: SearchVehicleByPlateUseCase },
];

export const parkingRoutes: Routes = [
  {
    path: '',
    providers: parkingProviders,
    loadComponent: () =>
      import('./presentation/pages/operator-dashboard.page').then(
        (m) => m.OperatorDashboardPageComponent,
      ),
  },
];
