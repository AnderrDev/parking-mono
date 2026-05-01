import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { requireRole } from '../../core/guards/role.guard';
import {
  PARKING_REPOSITORY_TOKEN,
  PARKING_REMOTE_DATASOURCE_TOKEN,
  GET_ACTIVE_SESSIONS_TOKEN,
  REGISTER_VEHICLE_ENTRY_TOKEN,
  REGISTER_VEHICLE_EXIT_TOKEN,
  SEARCH_VEHICLE_BY_PLATE_TOKEN,
  CHECK_MONTHLY_PLAN_TOKEN,
  REPORT_REPOSITORY_TOKEN,
  REPORT_REMOTE_DATASOURCE_TOKEN,
  GET_REVENUE_BY_PERIOD_TOKEN,
  GET_SESSIONS_BY_TYPE_TOKEN,
  GET_OPERATOR_PERFORMANCE_TOKEN,
  EXPORT_CSV_TOKEN,
  MONTHLY_PLAN_REPOSITORY_TOKEN,
  MONTHLY_PLAN_REMOTE_DATASOURCE_TOKEN,
  LIST_MONTHLY_PLANS_TOKEN,
  CREATE_MONTHLY_PLAN_TOKEN,
  UPDATE_MONTHLY_PLAN_TOKEN,
  CANCEL_MONTHLY_PLAN_TOKEN,
} from '../../core/di/injection-tokens';
import { ParkingRemoteDataSource } from '../parking/data/datasources/parking-remote.datasource';
import { ParkingRepositoryImpl } from '../parking/data/repositories/parking.repository.impl';
import { GetActiveSessionsUseCase } from '../parking/domain/usecases/get-active-sessions.usecase';
import { RegisterVehicleEntryUseCase } from '../parking/domain/usecases/register-vehicle-entry.usecase';
import { RegisterVehicleExitUseCase } from '../parking/domain/usecases/register-vehicle-exit.usecase';
import { SearchVehicleByPlateUseCase } from '../parking/domain/usecases/search-vehicle-by-plate.usecase';
import { CheckMonthlyPlanUseCase } from '../parking/domain/usecases/check-monthly-plan.usecase';
import { ReportRemoteDataSource } from '../reports/data/datasources/report-remote.datasource';
import { ReportRepositoryImpl } from '../reports/data/repositories/report.repository.impl';
import { GetRevenueByPeriodUseCase } from '../reports/domain/usecases/get-revenue-by-period.usecase';
import { GetSessionsByTypeUseCase } from '../reports/domain/usecases/get-sessions-by-type.usecase';
import { GetOperatorPerformanceUseCase } from '../reports/domain/usecases/get-operator-performance.usecase';
import { ExportCsvUseCase } from '../reports/domain/usecases/export-csv.usecase';
import { MonthlyPlanRemoteDataSource } from '../monthly-plans/data/datasources/monthly-plan-remote.datasource';
import { MonthlyPlanRepositoryImpl } from '../monthly-plans/data/repositories/monthly-plan.repository.impl';
import { ListMonthlyPlansUseCase } from '../monthly-plans/domain/usecases/list-monthly-plans.usecase';
import { CreateMonthlyPlanUseCase } from '../monthly-plans/domain/usecases/create-monthly-plan.usecase';
import { UpdateMonthlyPlanUseCase } from '../monthly-plans/domain/usecases/update-monthly-plan.usecase';
import { CancelMonthlyPlanUseCase } from '../monthly-plans/domain/usecases/cancel-monthly-plan.usecase';

const dashboardProviders = [
  // Parking (sólo el subset que usa el dashboard)
  { provide: PARKING_REMOTE_DATASOURCE_TOKEN, useClass: ParkingRemoteDataSource },
  { provide: PARKING_REPOSITORY_TOKEN, useClass: ParkingRepositoryImpl },
  { provide: GET_ACTIVE_SESSIONS_TOKEN, useClass: GetActiveSessionsUseCase },
  { provide: REGISTER_VEHICLE_ENTRY_TOKEN, useClass: RegisterVehicleEntryUseCase },
  { provide: REGISTER_VEHICLE_EXIT_TOKEN, useClass: RegisterVehicleExitUseCase },
  { provide: SEARCH_VEHICLE_BY_PLATE_TOKEN, useClass: SearchVehicleByPlateUseCase },
  { provide: CHECK_MONTHLY_PLAN_TOKEN, useClass: CheckMonthlyPlanUseCase },
  // Reports
  { provide: REPORT_REMOTE_DATASOURCE_TOKEN, useClass: ReportRemoteDataSource },
  { provide: REPORT_REPOSITORY_TOKEN, useClass: ReportRepositoryImpl },
  { provide: GET_REVENUE_BY_PERIOD_TOKEN, useClass: GetRevenueByPeriodUseCase },
  { provide: GET_SESSIONS_BY_TYPE_TOKEN, useClass: GetSessionsByTypeUseCase },
  { provide: GET_OPERATOR_PERFORMANCE_TOKEN, useClass: GetOperatorPerformanceUseCase },
  { provide: EXPORT_CSV_TOKEN, useClass: ExportCsvUseCase },
  // Monthly plans
  { provide: MONTHLY_PLAN_REMOTE_DATASOURCE_TOKEN, useClass: MonthlyPlanRemoteDataSource },
  { provide: MONTHLY_PLAN_REPOSITORY_TOKEN, useClass: MonthlyPlanRepositoryImpl },
  { provide: LIST_MONTHLY_PLANS_TOKEN, useClass: ListMonthlyPlansUseCase },
  { provide: CREATE_MONTHLY_PLAN_TOKEN, useClass: CreateMonthlyPlanUseCase },
  { provide: UPDATE_MONTHLY_PLAN_TOKEN, useClass: UpdateMonthlyPlanUseCase },
  { provide: CANCEL_MONTHLY_PLAN_TOKEN, useClass: CancelMonthlyPlanUseCase },
];

export const dashboardRoutes: Routes = [
  {
    path: '',
    providers: dashboardProviders,
    canActivate: [authGuard, requireRole('admin', 'contador')],
    loadComponent: () =>
      import('./presentation/pages/executive-dashboard.page').then(
        (m) => m.ExecutiveDashboardPageComponent,
      ),
    data: { title: 'Dashboard ejecutivo' },
  },
];
