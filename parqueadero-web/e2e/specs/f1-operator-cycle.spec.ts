// F1 — Ciclo del operador: login → registrar entrada → registrar salida con cobro.
//
// Selectores accesibles (sin data-testid). Cada matcher usa getByRole/getByLabel
// con accessible names sensibles a copy en español-CO.

import { test, expect } from '../fixtures/auth.fixture';

test.describe('F1 — Ciclo operador', () => {
  test('login + entrada + salida con cobro', async ({ page, loginAs }) => {
    await loginAs('operador');

    // Operador dashboard cargado.
    await expect(page).toHaveURL(/\/(operator|parking)/);

    // Asegurar turno abierto. Si hay banner/CTA "Abrir turno", abrimos.
    const openShiftCta = page.getByRole('button', { name: /abrir turno/i });
    if (await openShiftCta.isVisible().catch(() => false)) {
      await openShiftCta.click();
      await page.getByLabel(/efectivo inicial|saldo inicial/i).fill('50000');
      await page.getByRole('button', { name: /confirmar|abrir/i }).click();
      await expect(page.getByText(/turno abierto/i)).toBeVisible();
    }

    // Registrar entrada — placa única por timestamp para evitar uq_sessions_active.
    const plate = 'E2E' + Date.now().toString().slice(-3);
    await page.getByRole('button', { name: /registrar entrada|nuevo ingreso/i }).click();
    await page.getByLabel(/placa/i).fill(plate);

    // Tipo de vehículo: "carro" — radio o select.
    const carroOption = page.getByRole('radio', { name: /carro|automóvil/i });
    if (await carroOption.isVisible().catch(() => false)) {
      await carroOption.click();
    } else {
      await page.getByLabel(/tipo de vehículo/i).selectOption({ label: 'Carro' });
    }

    await page.getByRole('button', { name: /confirmar|registrar/i }).click();

    // Toast / banner success.
    await expect(page.getByText(new RegExp(plate, 'i')).first()).toBeVisible({ timeout: 10_000 });

    // Buscar la sesión activa por placa, abrir salida.
    const searchInput = page.getByPlaceholder(/buscar placa|placa/i).first();
    await searchInput.fill(plate);
    await page.getByRole('button', { name: /registrar salida|cobrar|salida/i }).click();

    // Confirmar cobro en efectivo.
    const cashRadio = page.getByRole('radio', { name: /efectivo/i });
    if (await cashRadio.isVisible().catch(() => false)) {
      await cashRadio.click();
    }
    await page.getByRole('button', { name: /confirmar salida|cobrar/i }).click();

    // Verificar que la placa ya no aparece en sesiones activas.
    await expect(page.getByText(new RegExp(`^${plate}$`, 'i'))).toHaveCount(0, { timeout: 10_000 });
  });
});
