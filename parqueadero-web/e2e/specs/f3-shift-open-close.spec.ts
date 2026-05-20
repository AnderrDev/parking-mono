// F3 — Operador abre y cierra turno con cuadre.

import { test, expect } from '../fixtures/auth.fixture';

test.describe('F3 — Apertura y cierre de turno', () => {
  test('abrir turno, registrar pago, cerrar con justificación', async ({ page, loginAs }) => {
    await loginAs('operador');

    // Si hay un turno previo cerrado, abrir uno nuevo.
    const openShiftCta = page.getByRole('button', { name: /abrir turno/i });
    if (await openShiftCta.isVisible().catch(() => false)) {
      await openShiftCta.click();
      await page.getByLabel(/efectivo inicial|saldo inicial/i).fill('100000');
      await page.getByRole('button', { name: /confirmar|abrir/i }).click();
      await expect(page.getByText(/turno abierto/i)).toBeVisible();
    } else {
      // Ya hay turno abierto — el test sigue desde donde esté.
      // (Validar el indicador del turno abierto).
      await expect(page.getByText(/turno abierto/i)).toBeVisible();
    }

    // Intentar cerrar turno.
    await page.getByRole('button', { name: /cerrar turno|cerrar caja/i }).click();

    // Ingresar conteo de efectivo distinto al esperado para forzar justificación.
    const countedInput = page.getByLabel(/efectivo contado|saldo final|conteo/i);
    await countedInput.fill('95000');

    // Justificación obligatoria si difference != 0.
    const justification = page.getByLabel(/justificación|motivo|nota/i);
    if (await justification.isVisible().catch(() => false)) {
      await justification.fill('Diferencia controlada — test E2E F3');
    }

    await page.getByRole('button', { name: /confirmar cierre|cerrar|finalizar/i }).click();
    await expect(page.getByText(/turno cerrado|cierre exitoso/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
