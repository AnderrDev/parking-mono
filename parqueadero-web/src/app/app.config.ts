import {
  APP_INITIALIZER,
  ApplicationConfig,
  inject,
  isDevMode,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import {
  AUTH_DATASOURCE_TOKEN,
  AUTH_REPOSITORY_TOKEN,
  LOGIN_USECASE_TOKEN,
  LOGOUT_USECASE_TOKEN,
  RESTORE_SESSION_USECASE_TOKEN,
  CHANGE_PASSWORD_USECASE_TOKEN,
  CUSTOMER_REPOSITORY_TOKEN,
  CUSTOMER_REMOTE_DATASOURCE_TOKEN,
  LIST_CUSTOMERS_TOKEN,
  CREATE_CUSTOMER_TOKEN,
  UPDATE_CUSTOMER_TOKEN,
  DEACTIVATE_CUSTOMER_TOKEN,
  INVOICING_REPOSITORY_TOKEN,
  INVOICING_REMOTE_DATASOURCE_TOKEN,
  REQUEST_INVOICE_TOKEN,
  REISSUE_INVOICE_TOKEN,
  LIST_INVOICES_TOKEN,
} from './core/di/injection-tokens';
import { AuthRemoteDataSource } from './features/auth/data/datasources/auth-remote.datasource';
import { AuthRepositoryImpl } from './features/auth/data/repositories/auth.repository.impl';
import { AuthRepository } from './features/auth/domain/repositories/auth.repository';
import { LoginUseCase } from './features/auth/domain/usecases/login.usecase';
import { LogoutUseCase } from './features/auth/domain/usecases/logout.usecase';
import { RestoreSessionUseCase } from './features/auth/domain/usecases/restore-session.usecase';
import { ChangePasswordUseCase } from './features/auth/domain/usecases/change-password.usecase';
import { CustomerRemoteDataSource } from './features/customers/data/datasources/customer-remote.datasource';
import { CustomerRepositoryImpl } from './features/customers/data/repositories/customer.repository.impl';
import { ListCustomersUseCase } from './features/customers/domain/usecases/list-customers.usecase';
import { CreateCustomerUseCase } from './features/customers/domain/usecases/create-customer.usecase';
import { UpdateCustomerUseCase } from './features/customers/domain/usecases/update-customer.usecase';
import { DeactivateCustomerUseCase } from './features/customers/domain/usecases/deactivate-customer.usecase';
import { InvoicingRemoteDataSource } from './features/invoicing/data/datasources/invoicing-remote.datasource';
import { InvoicingRepositoryImpl } from './features/invoicing/data/repositories/invoicing.repository.impl';
import { RequestInvoiceUseCase } from './features/invoicing/domain/usecases/request-invoice.usecase';
import { ReissueInvoiceUseCase } from './features/invoicing/domain/usecases/reissue-invoice.usecase';
import { ListInvoicesUseCase } from './features/invoicing/domain/usecases/list-invoices.usecase';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideHttpClient(withInterceptors([errorInterceptor])),
    provideAnimationsAsync(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),

    // Auth: root-scoped para que APP_INITIALIZER pueda restaurar la sesión
    // antes de que el router corra los guards. Sin esto, F5 expulsa al
    // usuario aunque Supabase tenga el JWT vivo en localStorage.
    { provide: AUTH_DATASOURCE_TOKEN, useClass: AuthRemoteDataSource },
    { provide: AUTH_REPOSITORY_TOKEN, useClass: AuthRepositoryImpl },
    { provide: LOGIN_USECASE_TOKEN, useClass: LoginUseCase },
    { provide: LOGOUT_USECASE_TOKEN, useClass: LogoutUseCase },
    { provide: RESTORE_SESSION_USECASE_TOKEN, useClass: RestoreSessionUseCase },
    { provide: CHANGE_PASSWORD_USECASE_TOKEN, useClass: ChangePasswordUseCase },

    // Customers: root-scoped — el exit dialog del parking necesita
    // search-customers para HU-040 (selector de cliente al emitir factura).
    { provide: CUSTOMER_REMOTE_DATASOURCE_TOKEN, useClass: CustomerRemoteDataSource },
    { provide: CUSTOMER_REPOSITORY_TOKEN, useClass: CustomerRepositoryImpl },
    { provide: LIST_CUSTOMERS_TOKEN, useClass: ListCustomersUseCase },
    { provide: CREATE_CUSTOMER_TOKEN, useClass: CreateCustomerUseCase },
    { provide: UPDATE_CUSTOMER_TOKEN, useClass: UpdateCustomerUseCase },
    { provide: DEACTIVATE_CUSTOMER_TOKEN, useClass: DeactivateCustomerUseCase },

    // Invoicing: root-scoped — el operator-dashboard llama request-invoice
    // tras una salida con factura activada (HU-040).
    { provide: INVOICING_REMOTE_DATASOURCE_TOKEN, useClass: InvoicingRemoteDataSource },
    { provide: INVOICING_REPOSITORY_TOKEN, useClass: InvoicingRepositoryImpl },
    { provide: REQUEST_INVOICE_TOKEN, useClass: RequestInvoiceUseCase },
    { provide: REISSUE_INVOICE_TOKEN, useClass: ReissueInvoiceUseCase },
    { provide: LIST_INVOICES_TOKEN, useClass: ListInvoicesUseCase },

    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => {
        const authRepo = inject<AuthRepository>(AUTH_REPOSITORY_TOKEN);
        return () => authRepo.getCurrentUser();
      },
    },
  ],
};
