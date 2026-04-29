import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

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
    canActivate: [authGuard],
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
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/reports/reports.routes').then((m) => m.reportsRoutes),
  },

  { path: '**', redirectTo: '/parking' },
];
