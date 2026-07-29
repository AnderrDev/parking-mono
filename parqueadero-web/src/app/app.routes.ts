import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { requireRole } from './core/guards/role.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/parking', pathMatch: 'full' },

  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },

  // Rutas protegidas por authGuard (placeholder — se completa en Fase 3)
  {
    path: 'parking',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/parking/parking.routes').then((m) => m.parkingRoutes),
  },
  {
    path: 'monthly-plans',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/monthly-plans/monthly-plans.routes').then(
        (m) => m.monthlyPlansRoutes,
      ),
  },
  {
    path: 'invoicing',
    canActivate: [authGuard, requireRole('admin', 'contador')],
    loadChildren: () =>
      import('./features/invoicing/invoicing.routes').then((m) => m.invoicingRoutes),
  },
  {
    path: 'payments',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/payments/payments.routes').then((m) => m.paymentsRoutes),
  },
  {
    path: 'cashier',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/cashier/cashier.routes').then((m) => m.cashierRoutes),
  },
  {
    path: 'customers',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/customers/customers.routes').then((m) => m.customersRoutes),
  },
  {
    path: 'reports',
    canActivate: [authGuard, requireRole('admin', 'contador', 'operador')],
    loadChildren: () =>
      import('./features/reports/reports.routes').then((m) => m.reportsRoutes),
  },

  {
    path: 'tariffs',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/tariffs/tariffs.routes').then((m) => m.tariffsRoutes),
  },
  {
    path: 'vehicles',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/vehicles/vehicles.routes').then((m) => m.vehiclesRoutes),
  },
  {
    path: 'account/password',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/auth/presentation/pages/change-password.page').then(
        (m) => m.ChangePasswordPageComponent,
      ),
    data: { title: 'Cambiar contraseña' },
  },
  {
    path: 'audit',
    loadChildren: () =>
      import('./features/audit/audit.routes').then((m) => m.auditRoutes),
  },
  {
    path: 'settings',
    loadChildren: () =>
      import('./features/settings/settings.routes').then((m) => m.settingsRoutes),
  },
  {
    path: 'users',
    loadChildren: () =>
      import('./features/users/users.routes').then((m) => m.usersRoutes),
  },
  {
    path: 'dashboard',
    loadChildren: () =>
      import('./features/dashboard/dashboard.routes').then((m) => m.dashboardRoutes),
  },

  { path: '**', redirectTo: '/parking' },
];
