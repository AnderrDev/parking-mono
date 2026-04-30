import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import {
  CASHIER_REPOSITORY_TOKEN,
  CASHIER_REMOTE_DATASOURCE_TOKEN,
  CASHIER_LOCAL_DATASOURCE_TOKEN,
  OPEN_SHIFT_TOKEN,
  CLOSE_SHIFT_TOKEN,
  RECONCILE_SHIFT_TOKEN,
  PAYMENT_REPOSITORY_TOKEN,
  PAYMENT_REMOTE_DATASOURCE_TOKEN,
  PAYMENT_LOCAL_DATASOURCE_TOKEN,
  LIST_PAYMENTS_TOKEN,
} from '../../core/di/injection-tokens';
import { CashierRemoteDataSource } from './data/datasources/cashier-remote.datasource';
import { CashierLocalDataSource } from './data/datasources/cashier-local.datasource';
import { CashierRepositoryImpl } from './data/repositories/cashier.repository.impl';
import { OpenShiftUseCase } from './domain/usecases/open-shift.usecase';
import { CloseShiftUseCase } from './domain/usecases/close-shift.usecase';
import { ReconcileShiftUseCase } from './domain/usecases/reconcile-shift.usecase';
import { PaymentRemoteDataSource } from '../payments/data/datasources/payment-remote.datasource';
import { PaymentLocalDataSource } from '../payments/data/datasources/payment-local.datasource';
import { PaymentRepositoryImpl } from '../payments/data/repositories/payment.repository.impl';
import { ListPaymentsUseCase } from '../payments/domain/usecases/list-payments.usecase';

const cashierProviders = [
  { provide: CASHIER_REMOTE_DATASOURCE_TOKEN, useClass: CashierRemoteDataSource },
  { provide: CASHIER_LOCAL_DATASOURCE_TOKEN, useClass: CashierLocalDataSource },
  { provide: CASHIER_REPOSITORY_TOKEN, useClass: CashierRepositoryImpl },
  { provide: PAYMENT_REMOTE_DATASOURCE_TOKEN, useClass: PaymentRemoteDataSource },
  { provide: PAYMENT_LOCAL_DATASOURCE_TOKEN, useClass: PaymentLocalDataSource },
  { provide: PAYMENT_REPOSITORY_TOKEN, useClass: PaymentRepositoryImpl },
  { provide: OPEN_SHIFT_TOKEN, useClass: OpenShiftUseCase },
  { provide: CLOSE_SHIFT_TOKEN, useClass: CloseShiftUseCase },
  { provide: RECONCILE_SHIFT_TOKEN, useClass: ReconcileShiftUseCase },
  { provide: LIST_PAYMENTS_TOKEN, useClass: ListPaymentsUseCase },
];

export const cashierRoutes: Routes = [
  {
    path: '',
    providers: cashierProviders,
    canActivate: [authGuard],
    loadComponent: () =>
      import('./presentation/pages/cashier-shift.page').then(
        (m) => m.CashierShiftPageComponent,
      ),
    data: { title: 'Caja' },
  },
];
