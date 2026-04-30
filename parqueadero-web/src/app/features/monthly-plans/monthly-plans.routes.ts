import { Routes } from '@angular/router';
import {
  MONTHLY_PLAN_REPOSITORY_TOKEN,
  MONTHLY_PLAN_REMOTE_DATASOURCE_TOKEN,
  MONTHLY_PLAN_LOCAL_DATASOURCE_TOKEN,
  LIST_MONTHLY_PLANS_TOKEN,
  CREATE_MONTHLY_PLAN_TOKEN,
  UPDATE_MONTHLY_PLAN_TOKEN,
  CANCEL_MONTHLY_PLAN_TOKEN,
  CUSTOMER_REPOSITORY_TOKEN,
  CUSTOMER_REMOTE_DATASOURCE_TOKEN,
  CUSTOMER_LOCAL_DATASOURCE_TOKEN,
} from '../../core/di/injection-tokens';
import { MonthlyPlanRemoteDataSource } from './data/datasources/monthly-plan-remote.datasource';
import { MonthlyPlanLocalDataSource } from './data/datasources/monthly-plan-local.datasource';
import { MonthlyPlanRepositoryImpl } from './data/repositories/monthly-plan.repository.impl';
import { ListMonthlyPlansUseCase } from './domain/usecases/list-monthly-plans.usecase';
import { CreateMonthlyPlanUseCase } from './domain/usecases/create-monthly-plan.usecase';
import { UpdateMonthlyPlanUseCase } from './domain/usecases/update-monthly-plan.usecase';
import { CancelMonthlyPlanUseCase } from './domain/usecases/cancel-monthly-plan.usecase';
import { CustomerRemoteDataSource } from '../customers/data/datasources/customer-remote.datasource';
import { CustomerLocalDataSource } from '../customers/data/datasources/customer-local.datasource';
import { CustomerRepositoryImpl } from '../customers/data/repositories/customer.repository.impl';

const monthlyPlanProviders = [
  { provide: MONTHLY_PLAN_REMOTE_DATASOURCE_TOKEN, useClass: MonthlyPlanRemoteDataSource },
  { provide: MONTHLY_PLAN_LOCAL_DATASOURCE_TOKEN, useClass: MonthlyPlanLocalDataSource },
  { provide: MONTHLY_PLAN_REPOSITORY_TOKEN, useClass: MonthlyPlanRepositoryImpl },
  { provide: CUSTOMER_REMOTE_DATASOURCE_TOKEN, useClass: CustomerRemoteDataSource },
  { provide: CUSTOMER_LOCAL_DATASOURCE_TOKEN, useClass: CustomerLocalDataSource },
  { provide: CUSTOMER_REPOSITORY_TOKEN, useClass: CustomerRepositoryImpl },
  { provide: LIST_MONTHLY_PLANS_TOKEN, useClass: ListMonthlyPlansUseCase },
  { provide: CREATE_MONTHLY_PLAN_TOKEN, useClass: CreateMonthlyPlanUseCase },
  { provide: UPDATE_MONTHLY_PLAN_TOKEN, useClass: UpdateMonthlyPlanUseCase },
  { provide: CANCEL_MONTHLY_PLAN_TOKEN, useClass: CancelMonthlyPlanUseCase },
];

export const monthlyPlansRoutes: Routes = [
  {
    path: '',
    providers: monthlyPlanProviders,
    loadComponent: () =>
      import('./presentation/pages/monthly-plans-list.page').then((m) => m.MonthlyPlansListPageComponent),
  },
];
