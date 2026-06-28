import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { requireRole } from '../../core/guards/role.guard';
import {
  PARKING_REPOSITORY_TOKEN,
  PARKING_REMOTE_DATASOURCE_TOKEN,
  REGISTER_VEHICLE_ENTRY_TOKEN,
  REGISTER_VEHICLE_EXIT_TOKEN,
  GET_ACTIVE_SESSIONS_TOKEN,
  GET_ACTIVE_TARIFF_TOKEN,
  SEARCH_VEHICLE_BY_PLATE_TOKEN,
  SEARCH_PLATE_SUGGESTIONS_TOKEN,
  CHECK_MONTHLY_PLAN_TOKEN,
  LIST_SESSIONS_TOKEN,
  CANCEL_SESSION_TOKEN,
  GET_OPEN_SHIFT_STATUS_TOKEN,
  GET_VEHICLE_HISTORY_STATS_TOKEN,
  MONTHLY_PLAN_REPOSITORY_TOKEN,
  MONTHLY_PLAN_REMOTE_DATASOURCE_TOKEN,
  LIST_MONTHLY_PLANS_TOKEN,
} from '../../core/di/injection-tokens';
import { ParkingRemoteDataSource } from './data/datasources/parking-remote.datasource';
import { ParkingRepositoryImpl } from './data/repositories/parking.repository.impl';
import { RegisterVehicleEntryUseCase } from './domain/usecases/register-vehicle-entry.usecase';
import { RegisterVehicleExitUseCase } from './domain/usecases/register-vehicle-exit.usecase';
import { GetActiveSessionsUseCase } from './domain/usecases/get-active-sessions.usecase';
import { SearchVehicleByPlateUseCase } from './domain/usecases/search-vehicle-by-plate.usecase';
import { SearchPlateSuggestionsUseCase } from './domain/usecases/search-plate-suggestions.usecase';
import { CheckMonthlyPlanUseCase } from './domain/usecases/check-monthly-plan.usecase';
import { ListSessionsUseCase } from './domain/usecases/list-sessions.usecase';
import { CancelParkingSessionUseCase } from './domain/usecases/cancel-session.usecase';
import { GetActiveTariffUseCase } from './domain/usecases/get-active-tariff.usecase';
import { GetOpenShiftStatusUseCase } from './domain/usecases/get-open-shift-status.usecase';
import { GetVehicleHistoryStatsUseCase } from './domain/usecases/get-vehicle-history-stats.usecase';
import { PrintEntryTicketUseCase } from './domain/usecases/print-entry-ticket.usecase';
import { MonthlyPlanRemoteDataSource } from '../monthly-plans/data/datasources/monthly-plan-remote.datasource';
import { MonthlyPlanRepositoryImpl } from '../monthly-plans/data/repositories/monthly-plan.repository.impl';
import { ListMonthlyPlansUseCase } from '../monthly-plans/domain/usecases/list-monthly-plans.usecase';

const parkingProviders = [
  { provide: PARKING_REMOTE_DATASOURCE_TOKEN, useClass: ParkingRemoteDataSource },
  { provide: PARKING_REPOSITORY_TOKEN, useClass: ParkingRepositoryImpl },
  { provide: REGISTER_VEHICLE_ENTRY_TOKEN, useClass: RegisterVehicleEntryUseCase },
  { provide: REGISTER_VEHICLE_EXIT_TOKEN, useClass: RegisterVehicleExitUseCase },
  { provide: GET_ACTIVE_SESSIONS_TOKEN, useClass: GetActiveSessionsUseCase },
  { provide: SEARCH_VEHICLE_BY_PLATE_TOKEN, useClass: SearchVehicleByPlateUseCase },
  { provide: SEARCH_PLATE_SUGGESTIONS_TOKEN, useClass: SearchPlateSuggestionsUseCase },
  { provide: CHECK_MONTHLY_PLAN_TOKEN, useClass: CheckMonthlyPlanUseCase },
  { provide: LIST_SESSIONS_TOKEN, useClass: ListSessionsUseCase },
  { provide: CANCEL_SESSION_TOKEN, useClass: CancelParkingSessionUseCase },
  { provide: GET_ACTIVE_TARIFF_TOKEN, useClass: GetActiveTariffUseCase },
  { provide: GET_OPEN_SHIFT_STATUS_TOKEN, useClass: GetOpenShiftStatusUseCase },
  { provide: GET_VEHICLE_HISTORY_STATS_TOKEN, useClass: GetVehicleHistoryStatsUseCase },
  // Use case route-scoped por el flujo de entrada, pero el renderer es root-scoped
  // porque también se usa desde invoicing, payments y settings.
  PrintEntryTicketUseCase,
  // HU-047: monthly plans panel en la vista del operador.
  { provide: MONTHLY_PLAN_REMOTE_DATASOURCE_TOKEN, useClass: MonthlyPlanRemoteDataSource },
  { provide: MONTHLY_PLAN_REPOSITORY_TOKEN, useClass: MonthlyPlanRepositoryImpl },
  { provide: LIST_MONTHLY_PLANS_TOKEN, useClass: ListMonthlyPlansUseCase },
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
  {
    path: 'history',
    providers: parkingProviders,
    canActivate: [authGuard, requireRole('admin', 'contador')],
    loadComponent: () =>
      import('./presentation/pages/session-history.page').then(
        (m) => m.SessionHistoryPageComponent,
      ),
    data: { title: 'Historial de sesiones' },
  },
];
