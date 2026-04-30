import { Routes } from '@angular/router';
import {
  VEHICLE_REPOSITORY_TOKEN,
  VEHICLE_REMOTE_DATASOURCE_TOKEN,
  VEHICLE_LOCAL_DATASOURCE_TOKEN,
  LIST_VEHICLES_TOKEN,
  CREATE_VEHICLE_TOKEN,
  UPDATE_VEHICLE_TOKEN,
  DEACTIVATE_VEHICLE_TOKEN,
  CUSTOMER_REPOSITORY_TOKEN,
  CUSTOMER_REMOTE_DATASOURCE_TOKEN,
  CUSTOMER_LOCAL_DATASOURCE_TOKEN,
} from '../../core/di/injection-tokens';
import { VehicleRemoteDataSource } from './data/datasources/vehicle-remote.datasource';
import { VehicleLocalDataSource } from './data/datasources/vehicle-local.datasource';
import { VehicleRepositoryImpl } from './data/repositories/vehicle.repository.impl';
import { ListVehiclesUseCase } from './domain/usecases/list-vehicles.usecase';
import { CreateVehicleUseCase } from './domain/usecases/create-vehicle.usecase';
import { UpdateVehicleUseCase } from './domain/usecases/update-vehicle.usecase';
import { DeactivateVehicleUseCase } from './domain/usecases/deactivate-vehicle.usecase';
import { CustomerRemoteDataSource } from '../customers/data/datasources/customer-remote.datasource';
import { CustomerLocalDataSource } from '../customers/data/datasources/customer-local.datasource';
import { CustomerRepositoryImpl } from '../customers/data/repositories/customer.repository.impl';

const vehicleProviders = [
  { provide: VEHICLE_REMOTE_DATASOURCE_TOKEN, useClass: VehicleRemoteDataSource },
  { provide: VEHICLE_LOCAL_DATASOURCE_TOKEN, useClass: VehicleLocalDataSource },
  { provide: VEHICLE_REPOSITORY_TOKEN, useClass: VehicleRepositoryImpl },
  { provide: CUSTOMER_REMOTE_DATASOURCE_TOKEN, useClass: CustomerRemoteDataSource },
  { provide: CUSTOMER_LOCAL_DATASOURCE_TOKEN, useClass: CustomerLocalDataSource },
  { provide: CUSTOMER_REPOSITORY_TOKEN, useClass: CustomerRepositoryImpl },
  { provide: LIST_VEHICLES_TOKEN, useClass: ListVehiclesUseCase },
  { provide: CREATE_VEHICLE_TOKEN, useClass: CreateVehicleUseCase },
  { provide: UPDATE_VEHICLE_TOKEN, useClass: UpdateVehicleUseCase },
  { provide: DEACTIVATE_VEHICLE_TOKEN, useClass: DeactivateVehicleUseCase },
];

export const vehiclesRoutes: Routes = [
  {
    path: '',
    providers: vehicleProviders,
    loadComponent: () =>
      import('./presentation/pages/vehicles-list.page').then((m) => m.VehiclesListPageComponent),
  },
];
