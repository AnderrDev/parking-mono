import { Routes } from '@angular/router';

export const invoicingRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/components/placeholder-page/placeholder-page.component').then(
        (m) => m.PlaceholderPageComponent,
      ),
    data: { title: 'Facturación', description: 'Emisión de facturas DIAN — Fase 9' },
  },
];
