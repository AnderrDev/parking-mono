import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

// Los providers de invoicing viven en `app.config.ts` (root) para que el
// operator-dashboard pueda llamar request-invoice tras una salida (HU-040).

export const invoicingRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./presentation/pages/invoices-list.page').then((m) => m.InvoicesListPageComponent),
    data: { title: 'Facturas' },
  },
];
