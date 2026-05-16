// Fixture de auth para E2E. Login con selectores accesibles.
//
// Pre-requisitos:
// - Usuarios admin@e2e.local y operador@e2e.local deben existir en la BD
//   (ver e2e/README.md §TODO y seed.e2e.sql).

import { test as base, expect } from '@playwright/test';

type Role = 'admin' | 'operador';

const credentials: Record<Role, { email: string; password: string }> = {
  admin: {
    email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@e2e.local',
    password: process.env['E2E_ADMIN_PASSWORD'] ?? 'E2eAdmin!2026',
  },
  operador: {
    email: process.env['E2E_OPERADOR_EMAIL'] ?? 'operador@e2e.local',
    password: process.env['E2E_OPERADOR_PASSWORD'] ?? 'E2eOperador!2026',
  },
};

type Fixtures = {
  loginAs: (role: Role) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  loginAs: async ({ page }, use) => {
    const login = async (role: Role) => {
      await page.goto('/auth/login');
      const { email, password } = credentials[role];

      // Selectores accesibles: por label visible del formulario.
      await page.getByLabel(/correo|email/i).fill(email);
      await page.getByLabel(/contraseña|password/i).fill(password);
      await page.getByRole('button', { name: /iniciar sesión|ingresar|entrar/i }).click();

      // Esperamos redirección fuera de /auth/login.
      await expect(page).not.toHaveURL(/\/auth\/login/);
    };
    await use(login);
  },
});

export { expect } from '@playwright/test';
