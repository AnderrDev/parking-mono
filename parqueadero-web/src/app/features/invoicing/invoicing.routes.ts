import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

// Los providers de invoicing viven en `app.config.ts` (root) para que el
// operator-dashboard pueda llamar request-invoice tras una salida.

export const invoicingRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./presentation/pages/invoices-list.page').then((m) => m.InvoicesListPageComponent),
    data: { title: 'Tickets' },
  },
  {
    path: ':id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./presentation/pages/invoice-detail.page').then((m) => m.InvoiceDetailPageComponent),
    data: { title: 'Detalle ticket' },
  },
];
