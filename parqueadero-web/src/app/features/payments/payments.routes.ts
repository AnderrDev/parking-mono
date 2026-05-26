import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { requireRole } from '../../core/guards/role.guard';
import {
  CASHIER_REPOSITORY_TOKEN,
  CASHIER_REMOTE_DATASOURCE_TOKEN,
  PAYMENT_REPOSITORY_TOKEN,
  PAYMENT_REMOTE_DATASOURCE_TOKEN,
  LIST_PAYMENTS_TOKEN,
  REGISTER_PAYMENT_TOKEN,
} from '../../core/di/injection-tokens';
import { CashierRemoteDataSource } from '../cashier/data/datasources/cashier-remote.datasource';
import { CashierRepositoryImpl } from '../cashier/data/repositories/cashier.repository.impl';
import { PaymentRemoteDataSource } from './data/datasources/payment-remote.datasource';
import { PaymentRepositoryImpl } from './data/repositories/payment.repository.impl';
import { ListPaymentsUseCase } from './domain/usecases/list-payments.usecase';
import { RegisterPaymentUseCase } from './domain/usecases/register-payment.usecase';

const paymentsProviders = [
  { provide: CASHIER_REMOTE_DATASOURCE_TOKEN, useClass: CashierRemoteDataSource },
  { provide: CASHIER_REPOSITORY_TOKEN, useClass: CashierRepositoryImpl },
  { provide: PAYMENT_REMOTE_DATASOURCE_TOKEN, useClass: PaymentRemoteDataSource },
  { provide: PAYMENT_REPOSITORY_TOKEN, useClass: PaymentRepositoryImpl },
  { provide: LIST_PAYMENTS_TOKEN, useClass: ListPaymentsUseCase },
  { provide: REGISTER_PAYMENT_TOKEN, useClass: RegisterPaymentUseCase },
];

export const paymentsRoutes: Routes = [
  {
    path: '',
    providers: paymentsProviders,
    canActivate: [authGuard, requireRole('admin', 'contador')],
    loadComponent: () =>
      import('./presentation/pages/payments-history.page').then((m) => m.PaymentsHistoryPageComponent),
    data: { title: 'Historial de cobros' },
  },
];
