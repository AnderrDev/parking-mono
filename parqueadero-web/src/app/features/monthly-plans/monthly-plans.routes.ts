import { Routes } from '@angular/router';

export const monthlyPlansRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/components/placeholder-page/placeholder-page.component').then(
        (m) => m.PlaceholderPageComponent,
      ),
    data: { title: 'Planes mensuales', description: 'Gestión de mensualidades — Fase 5' },
  },
];
