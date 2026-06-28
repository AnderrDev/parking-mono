import { Injectable, inject } from '@angular/core';
import qz from 'qz-tray';
import { QzSigningService } from './qz-signing.service';
import { getQzPrintErrorMessage } from './qz-print-error';

const CASH_DRAWER_PULSE = '\x1b\x70\x00\x19\xfa';

export type QzParkingPrintChunk =
  | string
  | {
      type: 'raw';
      format: 'image';
      flavor: 'base64';
      data: string;
      options: { language: 'ESCPOS' };
    };

export interface QzParkingPrintOptions {
  openCashDrawer?: boolean;
}

@Injectable({ providedIn: 'root' })
export class QzParkingPrinterService {
  private readonly signing = inject(QzSigningService);
  private connectionPromise: Promise<void> | null = null;
  private printerPromises = new Map<string, Promise<string>>();

  async print(
    chunks: QzParkingPrintChunk[],
    configuredPrinterName: string,
    jobName: string,
    options: QzParkingPrintOptions = {},
  ): Promise<void> {
    try {
      await this.ensureConnected();
      const printerName = await this.findPrinter(configuredPrinterName);
      const config = qz.configs.create(printerName, { jobName });
      await qz.print(config, [
        ...(options.openCashDrawer ? [CASH_DRAWER_PULSE] : []),
        ...chunks,
      ]);
    } catch (error) {
      throw new Error(getQzPrintErrorMessage(error, configuredPrinterName), { cause: error });
    }
  }

  async openCashDrawer(configuredPrinterName: string): Promise<void> {
    try {
      await this.ensureConnected();
      const printerName = await this.findPrinter(configuredPrinterName);
      const config = qz.configs.create(printerName, { jobName: 'Parqueadero abrir caja' });
      await qz.print(config, [CASH_DRAWER_PULSE]);
    } catch (error) {
      throw new Error(getQzPrintErrorMessage(error, configuredPrinterName), { cause: error });
    }
  }

  private async ensureConnected(): Promise<void> {
    if (qz.websocket.isActive()) return;
    if (!this.connectionPromise) {
      this.connectionPromise = this.signing
        .configureIfAvailable()
        .then(() => qz.websocket.connect({ retries: 2, delay: 1 }))
        .finally(() => {
          this.connectionPromise = null;
        });
    }
    await this.connectionPromise;
  }

  private async findPrinter(configuredPrinterName: string): Promise<string> {
    const cacheKey = configuredPrinterName.trim().toLowerCase() || '__auto__';
    const cached = this.printerPromises.get(cacheKey);
    if (cached) return cached;

    const promise = this.resolvePrinter(configuredPrinterName).catch((error: unknown) => {
      this.printerPromises.delete(cacheKey);
      throw error;
    });
    this.printerPromises.set(cacheKey, promise);
    return promise;
  }

  private async resolvePrinter(configuredPrinterName: string): Promise<string> {
    const configured = configuredPrinterName.trim();
    if (!configured) return this.autoDetectPrinter();

    const found = await qz.printers.find(configured);
    if (typeof found === 'string') {
      if (found) return found;
      throw new Error(`No se encontró la impresora ${configured}`);
    }
    const exact = found.find((name) => name.toLowerCase() === configured.toLowerCase());
    if (exact) return exact;
    throw new Error(`No se encontró la impresora ${configured}`);
  }

  private async autoDetectPrinter(): Promise<string> {
    const found = await qz.printers.find();
    const printers = (typeof found === 'string' ? [found] : found).filter(Boolean);
    if (!printers.length) throw new Error('No se encontraron impresoras instaladas');

    const selected = chooseAutoDetectedPrinter(printers, null);
    if (selected) return selected;

    const defaultPrinter = await qz.printers.getDefault();
    const selectedWithDefault = chooseAutoDetectedPrinter(printers, defaultPrinter);
    if (selectedWithDefault) return selectedWithDefault;

    const firstPrinter = printers[0];
    if (!firstPrinter) throw new Error('No se encontraron impresoras instaladas');
    return firstPrinter;
  }
}

export function chooseAutoDetectedPrinter(
  printers: readonly string[],
  defaultPrinter: string | null,
): string | null {
  const thermal = printers.find((name) => isLikelyThermalPrinter(name));
  if (thermal) return thermal;
  if (defaultPrinter?.trim()) return defaultPrinter;
  return printers[0] ?? null;
}

function isLikelyThermalPrinter(name: string): boolean {
  const normalized = name.toLowerCase();
  return [
    'pos',
    'thermal',
    'receipt',
    'ticket',
    'epson',
    'tm-',
    'star',
    'xprinter',
    'xp-',
    'bixolon',
    'rongta',
    'gprinter',
    'zj-',
    '58',
    '80',
  ].some((token) => normalized.includes(token));
}
