import { Routes } from '@angular/router';

// Los providers de auth viven en `app.config.ts` (root) para que
// `provideAppInitializer` pueda restaurar la sesión antes del primer routing.

export const authRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./presentation/pages/login.page').then((m) => m.LoginPageComponent),
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
];

// Ruta para cambio de contraseña: protegida por authGuard, va a app.routes.
// Aquí solo se exporta el componente vía loadComponent en app.routes.ts.
