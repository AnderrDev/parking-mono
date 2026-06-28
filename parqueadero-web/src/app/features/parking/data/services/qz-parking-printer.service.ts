import { Injectable, inject } from '@angular/core';
import { QzSigningService } from './qz-signing.service';
import { getQzPrintErrorMessage } from './qz-print-error';
import { environment } from '../../../../../environments/environment';

const RAW_PRINT_OPTIONS = {
  encoding: 'ISO-8859-1',
  forceRaw: true,
} as const;

// Pulso estándar ESC/POS para abrir caja por el conector DK de la impresora.
// Antes se enviaban tres variantes en el mismo job para cubrir modelos
// distintos, pero eso genera múltiples golpes en cajas compatibles.
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

export interface QzParkingPrinterDiagnostic {
  connected: boolean;
  configuredPrinterName: string;
  selectedPrinterName: string | null;
  printers: string[];
  defaultPrinterName: string | null;
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
      const qz = await this.ensureConnected();
      const printerName = await this.findPrinter(configuredPrinterName);
      const config = qz.configs.create(printerName, { ...RAW_PRINT_OPTIONS, jobName });
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
      const qz = await this.ensureConnected();
      const printerName = await this.findPrinter(configuredPrinterName);
      const config = qz.configs.create(printerName, {
        ...RAW_PRINT_OPTIONS,
        jobName: 'Parqueadero abrir caja',
      });
      await qz.print(config, [CASH_DRAWER_PULSE]);
    } catch (error) {
      throw new Error(getQzPrintErrorMessage(error, configuredPrinterName), { cause: error });
    }
  }

  clearPrinterCache(): void {
    this.printerPromises.clear();
  }

  async diagnose(configuredPrinterName: string): Promise<QzParkingPrinterDiagnostic> {
    try {
      this.clearPrinterCache();
      const qz = await this.ensureConnected();
      const [found, defaultPrinterName] = await Promise.all([
        qz.printers.find(),
        qz.printers.getDefault().catch(() => null),
      ]);
      const printers = (typeof found === 'string' ? [found] : found).filter(Boolean);
      const selectedPrinterName = printers.length
        ? await this.resolvePrinter(configuredPrinterName).catch(() => null)
        : null;

      return {
        connected: qz.websocket.isActive(),
        configuredPrinterName: configuredPrinterName.trim(),
        selectedPrinterName,
        printers,
        defaultPrinterName,
      };
    } catch (error) {
      throw new Error(getQzPrintErrorMessage(error, configuredPrinterName), { cause: error });
    }
  }

  private async ensureConnected(): Promise<typeof import('qz-tray').default> {
    const qz = await loadQz();
    if (qz.websocket.isActive()) return qz;
    if (!this.connectionPromise) {
      this.connectionPromise = this.configureSecurity()
        .then(() => qz.websocket.connect({ retries: 2, delay: 1 }))
        .finally(() => {
          this.connectionPromise = null;
        });
    }
    await this.connectionPromise;
    return qz;
  }

  private configureSecurity(): Promise<boolean> {
    if (environment.qzSigningEnabled === false) return Promise.resolve(false);
    return this.signing.configureIfAvailable();
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
    const qz = await loadQz();
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
    const qz = await loadQz();
    const found = await qz.printers.find();
    const printers = (typeof found === 'string' ? [found] : found).filter(Boolean);
    if (!printers.length) throw new Error('No se encontraron impresoras instaladas');

    const defaultPrinter = await qz.printers.getDefault();
    const selected = chooseAutoDetectedPrinter(printers, defaultPrinter);
    if (selected) return selected;

    const firstPrinter = printers[0];
    if (!firstPrinter) throw new Error('No se encontraron impresoras instaladas');
    return firstPrinter;
  }
}

async function loadQz(): Promise<typeof import('qz-tray').default> {
  return (await import('qz-tray')).default;
}

export function chooseAutoDetectedPrinter(
  printers: readonly string[],
  defaultPrinter: string | null,
): string | null {
  if (defaultPrinter?.trim()) return defaultPrinter;
  const thermal = printers.find((name) => isLikelyThermalPrinter(name));
  if (thermal) return thermal;
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
    'digital pos',
    'dig-',
    'dig-180',
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
