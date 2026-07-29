import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { requireRole } from '../../core/guards/role.guard';
import {
  REPORT_REPOSITORY_TOKEN,
  REPORT_REMOTE_DATASOURCE_TOKEN,
  GET_REVENUE_BY_PERIOD_TOKEN,
  GET_SESSIONS_BY_TYPE_TOKEN,
  GET_OPERATOR_PERFORMANCE_TOKEN,
  EXPORT_CSV_TOKEN,
} from '../../core/di/injection-tokens';
import { ReportRemoteDataSource } from './data/datasources/report-remote.datasource';
import { ReportRepositoryImpl } from './data/repositories/report.repository.impl';
import { GetRevenueByPeriodUseCase } from './domain/usecases/get-revenue-by-period.usecase';
import { GetSessionsByTypeUseCase } from './domain/usecases/get-sessions-by-type.usecase';
import { GetOperatorPerformanceUseCase } from './domain/usecases/get-operator-performance.usecase';
import { ExportCsvUseCase } from './domain/usecases/export-csv.usecase';

const reportsProviders = [
  { provide: REPORT_REMOTE_DATASOURCE_TOKEN, useClass: ReportRemoteDataSource },
  { provide: REPORT_REPOSITORY_TOKEN, useClass: ReportRepositoryImpl },
  { provide: GET_REVENUE_BY_PERIOD_TOKEN, useClass: GetRevenueByPeriodUseCase },
  { provide: GET_SESSIONS_BY_TYPE_TOKEN, useClass: GetSessionsByTypeUseCase },
  { provide: GET_OPERATOR_PERFORMANCE_TOKEN, useClass: GetOperatorPerformanceUseCase },
  { provide: EXPORT_CSV_TOKEN, useClass: ExportCsvUseCase },
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
