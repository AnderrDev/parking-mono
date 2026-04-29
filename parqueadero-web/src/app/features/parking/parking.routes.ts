import { Routes } from '@angular/router';

export const parkingRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/components/placeholder-page/placeholder-page.component').then(
        (m) => m.PlaceholderPageComponent,
      ),
    data: { title: 'Parqueadero', description: 'Dashboard operario — Fase 4' },
  },
];
