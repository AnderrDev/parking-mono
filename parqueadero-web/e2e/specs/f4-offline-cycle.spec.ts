// F4 — Ciclo offline operador: snapshot, outbox, drain, logout protegido.
//
// Selectores accesibles (sin data-testid). Inspecciona Dexie directo vía
// page.evaluate + indexedDB.open (sin depender de globals expuestos).
//
// Pre-requisitos:
// - admin@e2e.local / operador@e2e.local sembrados (ver seed.e2e.sql).
// - Migrations 00019/00020/00021 aplicadas.

import { test, expect } from '../fixtures/auth.fixture';
import { pendingOutboxCount, mirrorCount } from '../utils/dexie-inspect';

test.describe('F4 — Ciclo offline operador', () => {
  test('snapshot al login pobla tablas mirror', async ({ page, loginAs }) => {
    await loginAs('operador');
    await expect(page).toHaveURL(/\/(operator|parking)/);

    // El snapshotPull es async; esperamos a que `tariffs` tenga al menos 1 fila.
    await expect.poll(
      () => mirrorCount(page, 'tariffs'),
      { timeout: 15_000, message: 'Esperando snapshot de tariffs' },
    ).toBeGreaterThan(0);

    // App settings también debe tener algo (config global).
    await expect.poll(
      () => mirrorCount(page, 'app_settings'),
      { timeout: 10_000 },
    ).toBeGreaterThan(0);
  });

  test('outbox: entrada offline → drain al recuperar red', async ({ page, context, loginAs }) => {
    await loginAs('operador');
    await expect(page).toHaveURL(/\/(operator|parking)/);

    // Esperamos al snapshot inicial.
    await expect.poll(() => mirrorCount(page, 'tariffs'), { timeout: 15_000 }).toBeGreaterThan(0);

    // Si no hay turno abierto, abrir uno para que se permita registrar entrada.
    const openShiftCta = page.getByRole('button', { name: /abrir turno/i });
    if (await openShiftCta.isVisible().catch(() => false)) {
      await openShiftCta.click();
      await page.getByLabel(/efectivo inicial|saldo inicial/i).fill('50000');
      await page.getByRole('button', { name: /confirmar|abrir/i }).click();
      await expect(page.getByText(/turno abierto/i)).toBeVisible({ timeout: 10_000 });
    }

    // Bajar red ANTES de registrar entrada → forzamos el path offline.
    await context.setOffline(true);

    const plate = 'OFF' + Date.now().toString().slice(-3);
    await page.getByRole('button', { name: /registrar entrada|nuevo ingreso/i }).click();
    await page.getByLabel(/placa/i).fill(plate);
    const carroOption = page.getByRole('radio', { name: /carro|automóvil/i });
    if (await carroOption.isVisible().catch(() => false)) {
      await carroOption.click();
    } else {
      await page.getByLabel(/tipo de vehículo/i).selectOption({ label: 'Carro' });
    }
    await page.getByRole('button', { name: /confirmar|registrar/i }).click();

    // La operación quedó encolada — verificamos en Dexie.
    await expect.poll(() => pendingOutboxCount(page), { timeout: 5_000 }).toBeGreaterThan(0);

    // El banner debe avisar "operación pendiente".
    await expect(page.getByText(/operación pendiente|operaciones pendientes/i)).toBeVisible({ timeout: 5_000 });

    // Subir red → el drain debe vaciar la outbox.
    await context.setOffline(false);
    await expect.poll(
      () => pendingOutboxCount(page),
      { timeout: 30_000, message: 'Esperando drain' },
    ).toBe(0);
  });

  test('logout con outbox pendiente abre confirm dialog', async ({ page, context, loginAs }) => {
    await loginAs('operador');
    await expect.poll(() => mirrorCount(page, 'tariffs'), { timeout: 15_000 }).toBeGreaterThan(0);

    // Aseguramos turno abierto.
    const openShiftCta = page.getByRole('button', { name: /abrir turno/i });
    if (await openShiftCta.isVisible().catch(() => false)) {
      await openShiftCta.click();
      await page.getByLabel(/efectivo inicial|saldo inicial/i).fill('50000');
      await page.getByRole('button', { name: /confirmar|abrir/i }).click();
      await expect(page.getByText(/turno abierto/i)).toBeVisible({ timeout: 10_000 });
    }

    // Forzar una operación offline para tener outbox > 0.
    await context.setOffline(true);
    const plate = 'LO' + Date.now().toString().slice(-4);
    await page.getByRole('button', { name: /registrar entrada|nuevo ingreso/i }).click();
    await page.getByLabel(/placa/i).fill(plate);
    const carroOption = page.getByRole('radio', { name: /carro|automóvil/i });
    if (await carroOption.isVisible().catch(() => false)) await carroOption.click();
    else await page.getByLabel(/tipo de vehículo/i).selectOption({ label: 'Carro' });
    await page.getByRole('button', { name: /confirmar|registrar/i }).click();

    await expect.poll(() => pendingOutboxCount(page), { timeout: 5_000 }).toBeGreaterThan(0);

    // Click logout → debe abrir confirm-dialog.
    await page.getByRole('button', { name: /cerrar sesión|logout|salir/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText(/sincronizar|pendiente/i)).toBeVisible();

    // Cancelamos → sigue logueado, outbox intacta.
    await dialog.getByRole('button', { name: /cancelar/i }).click();
    await expect(dialog).not.toBeVisible();
    expect(await pendingOutboxCount(page)).toBeGreaterThan(0);
  });

  test('banner cambia de estado offline → syncing → online', async ({ page, context, loginAs }) => {
    await loginAs('operador');
    await expect.poll(() => mirrorCount(page, 'tariffs'), { timeout: 15_000 }).toBeGreaterThan(0);

    // Online sin pendientes: banner oculto o estado neutral.
    await context.setOffline(true);
    // Sólo bajar la red debe mostrar "Sin conexión".
    await expect(page.getByText(/sin conexión/i)).toBeVisible({ timeout: 5_000 });

    await context.setOffline(false);
    // Tras volver online y sin pendientes el banner desaparece.
    await expect(page.getByText(/sin conexión/i)).not.toBeVisible({ timeout: 10_000 });
  });
});
