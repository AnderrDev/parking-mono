import { Routes } from '@angular/router';

export const authRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('../../shared/components/placeholder-page/placeholder-page.component').then(
        (m) => m.PlaceholderPageComponent,
      ),
    data: { title: 'Iniciar sesión', description: 'Login de operario y admin — Fase 3' },
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
];
