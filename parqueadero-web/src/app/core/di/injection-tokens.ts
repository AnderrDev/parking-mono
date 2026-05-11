import { InjectionToken } from '@angular/core';
import type { AuthRepository } from '../../features/auth/domain/repositories/auth.repository';
import type { AuthDataSource } from '../../features/auth/data/datasources/auth.datasource';
import type { LoginUseCase } from '../../features/auth/domain/usecases/login.usecase';
import type { LogoutUseCase } from '../../features/auth/domain/usecases/logout.usecase';
import type { RestoreSessionUseCase } from '../../features/auth/domain/usecases/restore-session.usecase';
import type { ChangePasswordUseCase } from '../../features/auth/domain/usecases/change-password.usecase';
import type { ParkingRepository } from '../../features/parking/domain/repositories/parking.repository';
import type { ParkingDataSource } from '../../features/parking/data/datasources/parking.datasource';
import type { RegisterVehicleEntryUseCase } from '../../features/parking/domain/usecases/register-vehicle-entry.usecase';
import type { RegisterVehicleExitUseCase } from '../../features/parking/domain/usecases/register-vehicle-exit.usecase';
import type { GetActiveSessionsUseCase } from '../../features/parking/domain/usecases/get-active-sessions.usecase';
import type { SearchVehicleByPlateUseCase } from '../../features/parking/domain/usecases/search-vehicle-by-plate.usecase';
import type { SearchPlateSuggestionsUseCase } from '../../features/parking/domain/usecases/search-plate-suggestions.usecase';
import type { CheckMonthlyPlanUseCase } from '../../features/parking/domain/usecases/check-monthly-plan.usecase';
import type { ListSessionsUseCase } from '../../features/parking/domain/usecases/list-sessions.usecase';
import type { CancelParkingSessionUseCase } from '../../features/parking/domain/usecases/cancel-session.usecase';
import type { GetActiveTariffUseCase } from '../../features/parking/domain/usecases/get-active-tariff.usecase';
import type { GetOpenShiftStatusUseCase } from '../../features/parking/domain/usecases/get-open-shift-status.usecase';
import type { TicketRendererPort } from '../../features/parking/domain/services/ticket-renderer.port';
import type { TariffRepository } from '../../features/tariffs/domain/repositories/tariff.repository';
import type { TariffDataSource } from '../../features/tariffs/data/datasources/tariff.datasource';
import type { ListTariffsUseCase } from '../../features/tariffs/domain/usecases/list-tariffs.usecase';
import type { CreateTariffUseCase } from '../../features/tariffs/domain/usecases/create-tariff.usecase';
import type { UpdateTariffUseCase } from '../../features/tariffs/domain/usecases/update-tariff.usecase';
import type { DeactivateTariffUseCase } from '../../features/tariffs/domain/usecases/deactivate-tariff.usecase';
import type { GetActiveMonthlyTariffUseCase } from '../../features/tariffs/domain/usecases/get-active-monthly-tariff.usecase';
import type { CustomerRepository } from '../../features/customers/domain/repositories/customer.repository';
import type { CustomerDataSource } from '../../features/customers/data/datasources/customer.datasource';
import type { ListCustomersUseCase } from '../../features/customers/domain/usecases/list-customers.usecase';
import type { CreateCustomerUseCase } from '../../features/customers/domain/usecases/create-customer.usecase';
import type { UpdateCustomerUseCase } from '../../features/customers/domain/usecases/update-customer.usecase';
import type { DeactivateCustomerUseCase } from '../../features/customers/domain/usecases/deactivate-customer.usecase';
import type { MonthlyPlanRepository } from '../../features/monthly-plans/domain/repositories/monthly-plan.repository';
import type { MonthlyPlanDataSource } from '../../features/monthly-plans/data/datasources/monthly-plan.datasource';
import type { ListMonthlyPlansUseCase } from '../../features/monthly-plans/domain/usecases/list-monthly-plans.usecase';
import type { CreateMonthlyPlanUseCase } from '../../features/monthly-plans/domain/usecases/create-monthly-plan.usecase';
import type { UpdateMonthlyPlanUseCase } from '../../features/monthly-plans/domain/usecases/update-monthly-plan.usecase';
import type { CancelMonthlyPlanUseCase } from '../../features/monthly-plans/domain/usecases/cancel-monthly-plan.usecase';
import type { VehicleRepository } from '../../features/vehicles/domain/repositories/vehicle.repository';
import type { VehicleDataSource } from '../../features/vehicles/data/datasources/vehicle.datasource';
import type { ListVehiclesUseCase } from '../../features/vehicles/domain/usecases/list-vehicles.usecase';
import type { CreateVehicleUseCase } from '../../features/vehicles/domain/usecases/create-vehicle.usecase';
import type { UpdateVehicleUseCase } from '../../features/vehicles/domain/usecases/update-vehicle.usecase';
import type { DeactivateVehicleUseCase } from '../../features/vehicles/domain/usecases/deactivate-vehicle.usecase';
import type { CashierRepository } from '../../features/cashier/domain/repositories/cashier.repository';
import type { CashierDataSource } from '../../features/cashier/data/datasources/cashier.datasource';
import type { OpenShiftUseCase } from '../../features/cashier/domain/usecases/open-shift.usecase';
import type { CloseShiftUseCase } from '../../features/cashier/domain/usecases/close-shift.usecase';
import type { ReconcileShiftUseCase } from '../../features/cashier/domain/usecases/reconcile-shift.usecase';
import type { ListShiftsUseCase } from '../../features/cashier/domain/usecases/list-shifts.usecase';
import type { RegisterCashWithdrawalUseCase } from '../../features/cashier/domain/usecases/register-withdrawal.usecase';
import type { PaymentRepository } from '../../features/payments/domain/repositories/payment.repository';
import type { PaymentDataSource } from '../../features/payments/data/datasources/payment.datasource';
import type { RegisterPaymentUseCase } from '../../features/payments/domain/usecases/register-payment.usecase';
import type { ListPaymentsUseCase } from '../../features/payments/domain/usecases/list-payments.usecase';
import type { ReportRepository } from '../../features/reports/domain/repositories/report.repository';
import type { ReportDataSource } from '../../features/reports/data/datasources/report.datasource';
import type { GetRevenueByPeriodUseCase } from '../../features/reports/domain/usecases/get-revenue-by-period.usecase';
import type { GetSessionsByTypeUseCase } from '../../features/reports/domain/usecases/get-sessions-by-type.usecase';
import type { GetOperatorPerformanceUseCase } from '../../features/reports/domain/usecases/get-operator-performance.usecase';
import type { ExportCsvUseCase } from '../../features/reports/domain/usecases/export-csv.usecase';
import type { InvoicingRepository } from '../../features/invoicing/domain/repositories/invoicing.repository';
import type { RequestInvoiceUseCase } from '../../features/invoicing/domain/usecases/request-invoice.usecase';
import type { ReissueInvoiceUseCase } from '../../features/invoicing/domain/usecases/reissue-invoice.usecase';
import type { ListInvoicesUseCase } from '../../features/invoicing/domain/usecases/list-invoices.usecase';
import type { AuditRepository } from '../../features/audit/domain/repositories/audit.repository';
import type { ListAuditUseCase } from '../../features/audit/domain/usecases/list-audit.usecase';
import type { SettingsRepository } from '../../features/settings/domain/repositories/settings.repository';
import type { GetSettingUseCase } from '../../features/settings/domain/usecases/get-setting.usecase';
import type { UpdateSettingUseCase } from '../../features/settings/domain/usecases/update-setting.usecase';
import type { UserAdminRepository } from '../../features/users/domain/repositories/user-admin.repository';
import type { ListUsersUseCase } from '../../features/users/domain/usecases/list-users.usecase';
import type { CreateUserUseCase } from '../../features/users/domain/usecases/create-user.usecase';
import type { UpdateUserRoleUseCase } from '../../features/users/domain/usecases/update-user-role.usecase';
import type { ToggleUserActiveUseCase } from '../../features/users/domain/usecases/toggle-user-active.usecase';

// ── Auth ────────────────────────────────────────────────────────────────────
export const AUTH_REPOSITORY_TOKEN = new InjectionToken<AuthRepository>('AuthRepository');
export const AUTH_DATASOURCE_TOKEN = new InjectionToken<AuthDataSource>('AuthDataSource');
export const LOGIN_USECASE_TOKEN = new InjectionToken<LoginUseCase>('LoginUseCase');
export const LOGOUT_USECASE_TOKEN = new InjectionToken<LogoutUseCase>('LogoutUseCase');
export const RESTORE_SESSION_USECASE_TOKEN = new InjectionToken<RestoreSessionUseCase>('RestoreSessionUseCase');
export const CHANGE_PASSWORD_USECASE_TOKEN = new InjectionToken<ChangePasswordUseCase>('ChangePasswordUseCase');

// ── Parking ─────────────────────────────────────────────────────────────────
export const PARKING_REPOSITORY_TOKEN = new InjectionToken<ParkingRepository>('ParkingRepository');
export const PARKING_REMOTE_DATASOURCE_TOKEN = new InjectionToken<ParkingDataSource>('ParkingRemoteDataSource');
export const REGISTER_VEHICLE_ENTRY_TOKEN = new InjectionToken<RegisterVehicleEntryUseCase>('RegisterVehicleEntryUseCase');
export const REGISTER_VEHICLE_EXIT_TOKEN = new InjectionToken<RegisterVehicleExitUseCase>('RegisterVehicleExitUseCase');
export const GET_ACTIVE_SESSIONS_TOKEN = new InjectionToken<GetActiveSessionsUseCase>('GetActiveSessionsUseCase');
export const SEARCH_VEHICLE_BY_PLATE_TOKEN = new InjectionToken<SearchVehicleByPlateUseCase>('SearchVehicleByPlateUseCase');
export const SEARCH_PLATE_SUGGESTIONS_TOKEN = new InjectionToken<SearchPlateSuggestionsUseCase>('SearchPlateSuggestionsUseCase');
export const CHECK_MONTHLY_PLAN_TOKEN = new InjectionToken<CheckMonthlyPlanUseCase>('CheckMonthlyPlanUseCase');
export const LIST_SESSIONS_TOKEN = new InjectionToken<ListSessionsUseCase>('ListSessionsUseCase');
export const CANCEL_SESSION_TOKEN = new InjectionToken<CancelParkingSessionUseCase>('CancelParkingSessionUseCase');
export const GET_ACTIVE_TARIFF_TOKEN = new InjectionToken<GetActiveTariffUseCase>('GetActiveTariffUseCase');
export const GET_OPEN_SHIFT_STATUS_TOKEN = new InjectionToken<GetOpenShiftStatusUseCase>('GetOpenShiftStatusUseCase');
export const TICKET_RENDERER_TOKEN = new InjectionToken<TicketRendererPort>('TicketRendererPort');

// ── Tariffs ──────────────────────────────────────────────────────────────────
export const TARIFF_REPOSITORY_TOKEN = new InjectionToken<TariffRepository>('TariffRepository');
export const TARIFF_REMOTE_DATASOURCE_TOKEN = new InjectionToken<TariffDataSource>('TariffRemoteDataSource');
export const LIST_TARIFFS_TOKEN = new InjectionToken<ListTariffsUseCase>('ListTariffsUseCase');
export const CREATE_TARIFF_TOKEN = new InjectionToken<CreateTariffUseCase>('CreateTariffUseCase');
export const UPDATE_TARIFF_TOKEN = new InjectionToken<UpdateTariffUseCase>('UpdateTariffUseCase');
export const DEACTIVATE_TARIFF_TOKEN = new InjectionToken<DeactivateTariffUseCase>('DeactivateTariffUseCase');
export const GET_ACTIVE_MONTHLY_TARIFF_TOKEN = new InjectionToken<GetActiveMonthlyTariffUseCase>('GetActiveMonthlyTariffUseCase');

// ── Customers ────────────────────────────────────────────────────────────────
export const CUSTOMER_REPOSITORY_TOKEN = new InjectionToken<CustomerRepository>('CustomerRepository');
export const CUSTOMER_REMOTE_DATASOURCE_TOKEN = new InjectionToken<CustomerDataSource>('CustomerRemoteDataSource');
export const LIST_CUSTOMERS_TOKEN = new InjectionToken<ListCustomersUseCase>('ListCustomersUseCase');
export const CREATE_CUSTOMER_TOKEN = new InjectionToken<CreateCustomerUseCase>('CreateCustomerUseCase');
export const UPDATE_CUSTOMER_TOKEN = new InjectionToken<UpdateCustomerUseCase>('UpdateCustomerUseCase');
export const DEACTIVATE_CUSTOMER_TOKEN = new InjectionToken<DeactivateCustomerUseCase>('DeactivateCustomerUseCase');

// ── Monthly Plans ─────────────────────────────────────────────────────────────
export const MONTHLY_PLAN_REPOSITORY_TOKEN = new InjectionToken<MonthlyPlanRepository>('MonthlyPlanRepository');
export const MONTHLY_PLAN_REMOTE_DATASOURCE_TOKEN = new InjectionToken<MonthlyPlanDataSource>('MonthlyPlanRemoteDataSource');
export const LIST_MONTHLY_PLANS_TOKEN = new InjectionToken<ListMonthlyPlansUseCase>('ListMonthlyPlansUseCase');
export const CREATE_MONTHLY_PLAN_TOKEN = new InjectionToken<CreateMonthlyPlanUseCase>('CreateMonthlyPlanUseCase');
export const UPDATE_MONTHLY_PLAN_TOKEN = new InjectionToken<UpdateMonthlyPlanUseCase>('UpdateMonthlyPlanUseCase');
export const CANCEL_MONTHLY_PLAN_TOKEN = new InjectionToken<CancelMonthlyPlanUseCase>('CancelMonthlyPlanUseCase');

// ── Vehicles ──────────────────────────────────────────────────────────────────
export const VEHICLE_REPOSITORY_TOKEN = new InjectionToken<VehicleRepository>('VehicleRepository');
export const VEHICLE_REMOTE_DATASOURCE_TOKEN = new InjectionToken<VehicleDataSource>('VehicleRemoteDataSource');
export const LIST_VEHICLES_TOKEN = new InjectionToken<ListVehiclesUseCase>('ListVehiclesUseCase');
export const CREATE_VEHICLE_TOKEN = new InjectionToken<CreateVehicleUseCase>('CreateVehicleUseCase');
export const UPDATE_VEHICLE_TOKEN = new InjectionToken<UpdateVehicleUseCase>('UpdateVehicleUseCase');
export const DEACTIVATE_VEHICLE_TOKEN = new InjectionToken<DeactivateVehicleUseCase>('DeactivateVehicleUseCase');

// ── Cashier ───────────────────────────────────────────────────────────────────
export const CASHIER_REPOSITORY_TOKEN = new InjectionToken<CashierRepository>('CashierRepository');
export const CASHIER_REMOTE_DATASOURCE_TOKEN = new InjectionToken<CashierDataSource>('CashierRemoteDataSource');
export const OPEN_SHIFT_TOKEN = new InjectionToken<OpenShiftUseCase>('OpenShiftUseCase');
export const CLOSE_SHIFT_TOKEN = new InjectionToken<CloseShiftUseCase>('CloseShiftUseCase');
export const RECONCILE_SHIFT_TOKEN = new InjectionToken<ReconcileShiftUseCase>('ReconcileShiftUseCase');
export const LIST_SHIFTS_TOKEN = new InjectionToken<ListShiftsUseCase>('ListShiftsUseCase');
export const REGISTER_WITHDRAWAL_TOKEN = new InjectionToken<RegisterCashWithdrawalUseCase>('RegisterCashWithdrawalUseCase');

// ── Payments ──────────────────────────────────────────────────────────────────
export const PAYMENT_REPOSITORY_TOKEN = new InjectionToken<PaymentRepository>('PaymentRepository');
export const PAYMENT_REMOTE_DATASOURCE_TOKEN = new InjectionToken<PaymentDataSource>('PaymentRemoteDataSource');
export const REGISTER_PAYMENT_TOKEN = new InjectionToken<RegisterPaymentUseCase>('RegisterPaymentUseCase');
export const LIST_PAYMENTS_TOKEN = new InjectionToken<ListPaymentsUseCase>('ListPaymentsUseCase');

// ── Reports ───────────────────────────────────────────────────────────────────
export const REPORT_REPOSITORY_TOKEN = new InjectionToken<ReportRepository>('ReportRepository');
export const REPORT_REMOTE_DATASOURCE_TOKEN = new InjectionToken<ReportDataSource>('ReportRemoteDataSource');
export const GET_REVENUE_BY_PERIOD_TOKEN = new InjectionToken<GetRevenueByPeriodUseCase>('GetRevenueByPeriodUseCase');
export const GET_SESSIONS_BY_TYPE_TOKEN = new InjectionToken<GetSessionsByTypeUseCase>('GetSessionsByTypeUseCase');
export const GET_OPERATOR_PERFORMANCE_TOKEN = new InjectionToken<GetOperatorPerformanceUseCase>('GetOperatorPerformanceUseCase');
export const EXPORT_CSV_TOKEN = new InjectionToken<ExportCsvUseCase>('ExportCsvUseCase');

// ── Invoicing ─────────────────────────────────────────────────────────────────
export const INVOICING_REPOSITORY_TOKEN = new InjectionToken<InvoicingRepository>('InvoicingRepository');
export const INVOICING_REMOTE_DATASOURCE_TOKEN = new InjectionToken<InvoicingRepository>('InvoicingRemoteDataSource');
export const REQUEST_INVOICE_TOKEN = new InjectionToken<RequestInvoiceUseCase>('RequestInvoiceUseCase');
export const REISSUE_INVOICE_TOKEN = new InjectionToken<ReissueInvoiceUseCase>('ReissueInvoiceUseCase');
export const LIST_INVOICES_TOKEN = new InjectionToken<ListInvoicesUseCase>('ListInvoicesUseCase');

// ── Audit ─────────────────────────────────────────────────────────────────────
export const AUDIT_REPOSITORY_TOKEN = new InjectionToken<AuditRepository>('AuditRepository');
export const AUDIT_DATASOURCE_TOKEN = new InjectionToken<AuditRepository>('AuditDataSource');
export const LIST_AUDIT_TOKEN = new InjectionToken<ListAuditUseCase>('ListAuditUseCase');

// ── Settings ──────────────────────────────────────────────────────────────────
export const SETTINGS_REPOSITORY_TOKEN = new InjectionToken<SettingsRepository>('SettingsRepository');
export const SETTINGS_DATASOURCE_TOKEN = new InjectionToken<SettingsRepository>('SettingsDataSource');
export const GET_SETTING_TOKEN = new InjectionToken<GetSettingUseCase>('GetSettingUseCase');
export const UPDATE_SETTING_TOKEN = new InjectionToken<UpdateSettingUseCase>('UpdateSettingUseCase');

// ── User management (admin) ───────────────────────────────────────────────────
export const USER_ADMIN_REPOSITORY_TOKEN = new InjectionToken<UserAdminRepository>('UserAdminRepository');
export const USER_ADMIN_DATASOURCE_TOKEN = new InjectionToken<UserAdminRepository>('UserAdminDataSource');
export const LIST_USERS_TOKEN = new InjectionToken<ListUsersUseCase>('ListUsersUseCase');
export const CREATE_USER_TOKEN = new InjectionToken<CreateUserUseCase>('CreateUserUseCase');
export const UPDATE_USER_ROLE_TOKEN = new InjectionToken<UpdateUserRoleUseCase>('UpdateUserRoleUseCase');
export const TOGGLE_USER_ACTIVE_TOKEN = new InjectionToken<ToggleUserActiveUseCase>('ToggleUserActiveUseCase');
