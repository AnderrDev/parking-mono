import { Routes } from '@angular/router';

export const cashierRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/components/placeholder-page/placeholder-page.component').then(
        (m) => m.PlaceholderPageComponent,
      ),
    data: { title: 'Caja', description: 'Apertura y cierre de turno — Fase 6' },
  },
];
