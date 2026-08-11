import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import {
  MONTHLY_PLAN_REPOSITORY_TOKEN,
  MONTHLY_PLAN_REMOTE_DATASOURCE_TOKEN,
  LIST_MONTHLY_PLANS_TOKEN,
  CREATE_MONTHLY_PLAN_TOKEN,
  UPDATE_MONTHLY_PLAN_TOKEN,
  CANCEL_MONTHLY_PLAN_TOKEN,
  CUSTOMER_REPOSITORY_TOKEN,
  CUSTOMER_REMOTE_DATASOURCE_TOKEN,
  LIST_CUSTOMERS_TOKEN,
  CREATE_CUSTOMER_TOKEN,
  CASHIER_REPOSITORY_TOKEN,
  CASHIER_REMOTE_DATASOURCE_TOKEN,
  PAYMENT_REPOSITORY_TOKEN,
  PAYMENT_REMOTE_DATASOURCE_TOKEN,
  TARIFF_REPOSITORY_TOKEN,
  TARIFF_REMOTE_DATASOURCE_TOKEN,
  GET_ACTIVE_PLAN_TARIFF_TOKEN,
} from '../../core/di/injection-tokens';
import { MonthlyPlanRemoteDataSource } from './data/datasources/monthly-plan-remote.datasource';
import { MonthlyPlanRepositoryImpl } from './data/repositories/monthly-plan.repository.impl';
import { ListMonthlyPlansUseCase } from './domain/usecases/list-monthly-plans.usecase';
import { CreateMonthlyPlanUseCase } from './domain/usecases/create-monthly-plan.usecase';
import { UpdateMonthlyPlanUseCase } from './domain/usecases/update-monthly-plan.usecase';
import { CancelMonthlyPlanUseCase } from './domain/usecases/cancel-monthly-plan.usecase';
import { CustomerRemoteDataSource } from '../customers/data/datasources/customer-remote.datasource';
import { CustomerRepositoryImpl } from '../customers/data/repositories/customer.repository.impl';
import { ListCustomersUseCase } from '../customers/domain/usecases/list-customers.usecase';
import { CreateCustomerUseCase } from '../customers/domain/usecases/create-customer.usecase';
import { CashierRemoteDataSource } from '../cashier/data/datasources/cashier-remote.datasource';
import { CashierRepositoryImpl } from '../cashier/data/repositories/cashier.repository.impl';
import { PaymentRemoteDataSource } from '../payments/data/datasources/payment-remote.datasource';
import { PaymentRepositoryImpl } from '../payments/data/repositories/payment.repository.impl';
import { TariffRemoteDataSource } from '../tariffs/data/datasources/tariff-remote.datasource';
import { TariffRepositoryImpl } from '../tariffs/data/repositories/tariff.repository.impl';
import { GetActivePlanTariffUseCase } from '../tariffs/domain/usecases/get-active-plan-tariff.usecase';

const monthlyPlanProviders = [
  { provide: MONTHLY_PLAN_REMOTE_DATASOURCE_TOKEN, useClass: MonthlyPlanRemoteDataSource },
  { provide: MONTHLY_PLAN_REPOSITORY_TOKEN, useClass: MonthlyPlanRepositoryImpl },
  { provide: CUSTOMER_REMOTE_DATASOURCE_TOKEN, useClass: CustomerRemoteDataSource },
  { provide: CUSTOMER_REPOSITORY_TOKEN, useClass: CustomerRepositoryImpl },
  { provide: LIST_MONTHLY_PLANS_TOKEN, useClass: ListMonthlyPlansUseCase },
  { provide: CREATE_MONTHLY_PLAN_TOKEN, useClass: CreateMonthlyPlanUseCase },
  { provide: UPDATE_MONTHLY_PLAN_TOKEN, useClass: UpdateMonthlyPlanUseCase },
  { provide: CANCEL_MONTHLY_PLAN_TOKEN, useClass: CancelMonthlyPlanUseCase },
  { provide: LIST_CUSTOMERS_TOKEN, useClass: ListCustomersUseCase },
  { provide: CREATE_CUSTOMER_TOKEN, useClass: CreateCustomerUseCase },
  // CashierRepository + PaymentRepository requeridos por CreateMonthlyPlanUseCase
  // para resolver el cashier_shift_id activo y registrar el ingreso.
  { provide: CASHIER_REMOTE_DATASOURCE_TOKEN, useClass: CashierRemoteDataSource },
  { provide: CASHIER_REPOSITORY_TOKEN, useClass: CashierRepositoryImpl },
  { provide: PAYMENT_REMOTE_DATASOURCE_TOKEN, useClass: PaymentRemoteDataSource },
  { provide: PAYMENT_REPOSITORY_TOKEN, useClass: PaymentRepositoryImpl },
  // Tariff repo + use case para auto-rellenar el monto del plan según
  // el tipo de vehículo seleccionado.
  { provide: TARIFF_REMOTE_DATASOURCE_TOKEN, useClass: TariffRemoteDataSource },
  { provide: TARIFF_REPOSITORY_TOKEN, useClass: TariffRepositoryImpl },
  { provide: GET_ACTIVE_PLAN_TARIFF_TOKEN, useClass: GetActivePlanTariffUseCase },
];

export const monthlyPlansRoutes: Routes = [
  {
    path: '',
    providers: monthlyPlanProviders,
    canActivate: [authGuard],
    loadComponent: () =>
      import('./presentation/pages/monthly-plans-list.page').then((m) => m.MonthlyPlansListPageComponent),
  },
];
