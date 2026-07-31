import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { requireRole } from '../../core/guards/role.guard';
import {
  REPORT_REPOSITORY_TOKEN,
  REPORT_REMOTE_DATASOURCE_TOKEN,
  GET_REVENUE_BY_PERIOD_TOKEN,
  GET_SESSIONS_BY_TYPE_TOKEN,
  GET_OPERATOR_PERFORMANCE_TOKEN,
  CASHIER_REPOSITORY_TOKEN,
  CASHIER_REMOTE_DATASOURCE_TOKEN,
  LIST_SHIFTS_TOKEN,
  PAYMENT_REPOSITORY_TOKEN,
  PAYMENT_REMOTE_DATASOURCE_TOKEN,
  LIST_SHIFT_PAYMENTS_TOKEN,
} from '../../core/di/injection-tokens';
import { ReportRemoteDataSource } from './data/datasources/report-remote.datasource';
import { ReportRepositoryImpl } from './data/repositories/report.repository.impl';
import { GetRevenueByPeriodUseCase } from './domain/usecases/get-revenue-by-period.usecase';
import { GetSessionsByTypeUseCase } from './domain/usecases/get-sessions-by-type.usecase';
import { GetOperatorPerformanceUseCase } from './domain/usecases/get-operator-performance.usecase';
import { CashierRemoteDataSource } from '../cashier/data/datasources/cashier-remote.datasource';
import { CashierRepositoryImpl } from '../cashier/data/repositories/cashier.repository.impl';
import { ListShiftsUseCase } from '../cashier/domain/usecases/list-shifts.usecase';
import { PaymentRemoteDataSource } from '../payments/data/datasources/payment-remote.datasource';
import { PaymentRepositoryImpl } from '../payments/data/repositories/payment.repository.impl';
import { ListShiftPaymentsUseCase } from '../payments/domain/usecases/list-shift-payments.usecase';

const reportsProviders = [
  { provide: REPORT_REMOTE_DATASOURCE_TOKEN, useClass: ReportRemoteDataSource },
  { provide: REPORT_REPOSITORY_TOKEN, useClass: ReportRepositoryImpl },
  { provide: GET_REVENUE_BY_PERIOD_TOKEN, useClass: GetRevenueByPeriodUseCase },
  { provide: GET_SESSIONS_BY_TYPE_TOKEN, useClass: GetSessionsByTypeUseCase },
  { provide: GET_OPERATOR_PERFORMANCE_TOKEN, useClass: GetOperatorPerformanceUseCase },
  // Cashier (reuso cross-feature para la pestaña "Cierres de caja", mismo patrón que dashboard.routes.ts)
  { provide: CASHIER_REMOTE_DATASOURCE_TOKEN, useClass: CashierRemoteDataSource },
  { provide: CASHIER_REPOSITORY_TOKEN, useClass: CashierRepositoryImpl },
  { provide: LIST_SHIFTS_TOKEN, useClass: ListShiftsUseCase },
  // Payments (reuso cross-feature para el detalle expandible de movimientos por turno)
  { provide: PAYMENT_REMOTE_DATASOURCE_TOKEN, useClass: PaymentRemoteDataSource },
  { provide: PAYMENT_REPOSITORY_TOKEN, useClass: PaymentRepositoryImpl },
  { provide: LIST_SHIFT_PAYMENTS_TOKEN, useClass: ListShiftPaymentsUseCase },
];

export const reportsRoutes: Routes = [
  {
    path: '',
    providers: reportsProviders,
    canActivate: [authGuard, requireRole('admin', 'contador', 'operador')],
    loadComponent: () =>
      import('./presentation/pages/reports.page').then((m) => m.ReportsPageComponent),
    data: { title: 'Reportes' },
  },
];
