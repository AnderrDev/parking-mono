// F2 — Admin gestiona tarifas: crear, editar, desactivar.

import { test, expect } from '../fixtures/auth.fixture';

test.describe('F2 — Admin CRUD tarifas', () => {
  test('crear, editar y desactivar tarifa', async ({ page, loginAs }) => {
    await loginAs('admin');
    await page.goto('/tariffs');

    // Crear
    const name = 'E2E-Tarifa-' + Date.now();
    await page.getByRole('button', { name: /nueva tarifa|crear|agregar/i }).first().click();

    await page.getByLabel(/nombre/i).fill(name);

    const vehicleTypeSelect = page.getByLabel(/tipo de vehículo/i);
    if (await vehicleTypeSelect.isVisible().catch(() => false)) {
      await vehicleTypeSelect.selectOption({ index: 1 });
    }

    const rateInput = page.getByLabel(/valor|tarifa|precio/i).first();
    await rateInput.fill('3500');

    await page.getByRole('button', { name: /guardar|crear|confirmar/i }).click();
    await expect(page.getByText(new RegExp(name, 'i'))).toBeVisible({ timeout: 10_000 });

    // Editar — abrir fila por nombre.
    const row = page.getByRole('row', { name: new RegExp(name, 'i') }).first();
    await row.getByRole('button', { name: /editar/i }).click();
    await page.getByLabel(/valor|tarifa|precio/i).first().fill('4000');
    await page.getByRole('button', { name: /guardar|actualizar/i }).click();
    await expect(page.getByText(/actualizad|guardad/i).first()).toBeVisible({ timeout: 10_000 });

    // Desactivar — toggle o botón "Desactivar".
    const deactivateBtn = row.getByRole('button', { name: /desactivar|eliminar/i });
    if (await deactivateBtn.isVisible().catch(() => false)) {
      await deactivateBtn.click();
      // Confirm dialog (si aplica).
      const confirmBtn = page.getByRole('button', { name: /confirmar|sí|desactivar/i }).last();
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
      }
      await expect(row.getByText(/inactiv|desactivad/i)).toBeVisible({ timeout: 10_000 });
    }
  });
});
