// Helpers para inspeccionar la base Dexie offline desde Playwright.
//
// Se ejecutan en el contexto del browser vía page.evaluate. La instancia de
// Dexie no está expuesta como `window.__dexie` en producción; usamos
// `indexedDB.open('parqueadero-local-db')` directo para evitar acoplamiento.

import type { Page } from '@playwright/test';

const DB_NAME = 'parqueadero-local-db';

/** Cuenta items en la outbox con `status='pending'`. */
export async function pendingOutboxCount(page: Page): Promise<number> {
  return page.evaluate(async (dbName) => {
    const open = (name: string): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const db = await open(dbName);
    return new Promise<number>((resolve, reject) => {
      const tx = db.transaction('outbox', 'readonly');
      const store = tx.objectStore('outbox');
      const idx = store.index('status');
      const req = idx.count(IDBKeyRange.only('pending'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }, DB_NAME);
}

/** Cuenta filas en una tabla mirror. */
export async function mirrorCount(page: Page, table: string): Promise<number> {
  return page.evaluate(
    async ({ dbName, table }) => {
      const open = (name: string): Promise<IDBDatabase> =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open(name);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      const db = await open(dbName);
      return new Promise<number>((resolve, reject) => {
        const tx = db.transaction(table, 'readonly');
        const store = tx.objectStore(table);
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    { dbName: DB_NAME, table },
  );
}

/** Borra completamente la base Dexie (reset entre tests). */
export async function resetLocalDb(page: Page): Promise<void> {
  await page.evaluate(async (dbName) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('deleteDatabase blocked — close other tabs'));
    });
  }, DB_NAME);
}
