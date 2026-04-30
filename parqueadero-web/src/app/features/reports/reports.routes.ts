import { Routes } from '@angular/router';

export const reportsRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/components/placeholder-page/placeholder-page.component').then(
        (m) => m.PlaceholderPageComponent,
      ),
    data: { title: 'Reportes', description: 'Reportes operativos y financieros — Fase 7' },
  },
];
