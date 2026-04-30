import { Routes } from '@angular/router';
import {
  CUSTOMER_REPOSITORY_TOKEN,
  CUSTOMER_REMOTE_DATASOURCE_TOKEN,
  CUSTOMER_LOCAL_DATASOURCE_TOKEN,
  LIST_CUSTOMERS_TOKEN,
  CREATE_CUSTOMER_TOKEN,
  UPDATE_CUSTOMER_TOKEN,
  DEACTIVATE_CUSTOMER_TOKEN,
} from '../../core/di/injection-tokens';
import { CustomerRemoteDataSource } from './data/datasources/customer-remote.datasource';
import { CustomerLocalDataSource } from './data/datasources/customer-local.datasource';
import { CustomerRepositoryImpl } from './data/repositories/customer.repository.impl';
import { ListCustomersUseCase } from './domain/usecases/list-customers.usecase';
import { CreateCustomerUseCase } from './domain/usecases/create-customer.usecase';
import { UpdateCustomerUseCase } from './domain/usecases/update-customer.usecase';
import { DeactivateCustomerUseCase } from './domain/usecases/deactivate-customer.usecase';

const customerProviders = [
  { provide: CUSTOMER_REMOTE_DATASOURCE_TOKEN, useClass: CustomerRemoteDataSource },
  { provide: CUSTOMER_LOCAL_DATASOURCE_TOKEN, useClass: CustomerLocalDataSource },
  { provide: CUSTOMER_REPOSITORY_TOKEN, useClass: CustomerRepositoryImpl },
  { provide: LIST_CUSTOMERS_TOKEN, useClass: ListCustomersUseCase },
  { provide: CREATE_CUSTOMER_TOKEN, useClass: CreateCustomerUseCase },
  { provide: UPDATE_CUSTOMER_TOKEN, useClass: UpdateCustomerUseCase },
  { provide: DEACTIVATE_CUSTOMER_TOKEN, useClass: DeactivateCustomerUseCase },
];

export const customersRoutes: Routes = [
  {
    path: '',
    providers: customerProviders,
    loadComponent: () =>
      import('./presentation/pages/customers-list.page').then((m) => m.CustomersListPageComponent),
  },
];
