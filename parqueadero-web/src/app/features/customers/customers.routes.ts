import { Routes } from '@angular/router';

// Los providers de customers viven en `app.config.ts` (root) para que el
// exit dialog del parking pueda usar list-customers (HU-040).

export const customersRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./presentation/pages/customers-list.page').then((m) => m.CustomersListPageComponent),
  },
];
