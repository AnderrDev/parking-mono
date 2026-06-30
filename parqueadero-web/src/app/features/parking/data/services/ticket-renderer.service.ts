// TicketRendererService — genera comandos ESC/POS para QZ Tray.
// Vive en data/ porque integra con infraestructura local de impresión.
//
// Spec: parqueadero-web/specs/features/parking/print-entry-ticket.spec.md (v2)
//
// El layout sigue el modelo del ticket BSNR (Carrera 17 #19A-06): header con
// tipo de parqueadero + nombre + datos legales (NIT, resolución), consecutivo
// destacado, placa grande, tabla de tarifas activas, banner de mensualidad si
// aplica, QR para scan en salida, dirección y horario de cierre en el footer.

import { Injectable, inject } from '@angular/core';
import { ParkingSessionEntity, VehicleType } from '../../domain/entities/parking-session.entity';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import {
  ExitReceiptPrintData,
  TicketRendererPort,
  TicketRenderResult,
} from '../../domain/services/ticket-renderer.port';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { formatCOP } from '../../../../shared/utils/currency.utils';
import { InvoiceDetailEntity } from '../../../invoicing/domain/entities/invoice-detail.entity';
import { PaymentMethod } from '../../domain/entities/payment.entity';
import {
  buildEscPosEntryReceipt,
  buildEscPosExitReceipt,
  buildEscPosSalesTicket,
} from './esc-pos-parking-receipt.builder';
import {
  QzParkingPrinterDiagnostic,
  QzParkingPrinterService,
} from './qz-parking-printer.service';
import { TicketPrintOptions } from '../../domain/services/ticket-renderer.port';

/** Datos necesarios para renderizar el comprobante de salida (cobro). */
export interface ExitReceiptData extends ExitReceiptPrintData {
  plate: string;
  vehicleType: VehicleType;
  entryAt: Date;
  exitAt: Date;
  durationMinutes: number;
  amountCents: number;
  paymentMethod: PaymentMethod;
  cashReceivedCents: number | null;
  tariffSnapshot: TariffEntity | null;
}

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo:         'Efectivo',
  tarjeta_credito:  'Tarjeta crédito',
  tarjeta_debito:   'Tarjeta débito',
  transferencia:    'Transferencia',
  nequi:            'Nequi',
  daviplata:        'Daviplata',
  cortesia:         'Cortesía',
  mensual:          'Mensualidad',
  error:            'Cobro corregido',
};

export interface ParkingInfo {
  name: string;
  nit: string;
  dv: string;
  address: string;
  phone: string;
  parkingType: 'publico' | 'privado' | '';
  resolutionNumber: string;
  closingTime: string;
  printerName: string;
  printEntryTicketEnabled: boolean;
  printExitReceiptEnabled: boolean;
  openDrawerOnCashPayment: boolean;
}

const FALLBACK_PARKING_INFO: ParkingInfo = {
  name: 'Parqueadero',
  nit: '',
  dv: '',
  address: '',
  phone: '',
  parkingType: '',
  resolutionNumber: '',
  closingTime: '',
  printerName: '',
  printEntryTicketEnabled: true,
  printExitReceiptEnabled: true,
  openDrawerOnCashPayment: false,
};

const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  carro: 'Carro',
  moto: 'Moto',
  bicicleta: 'Bicicleta',
  otro: 'Otro',
};

const VEHICLE_TYPE_ORDER: VehicleType[] = ['carro', 'moto', 'bicicleta', 'otro'];

const UNIT_LABEL: Record<TariffEntity['unit'], string> = {
  minuto: 'minuto',
  hora: 'hora',
  fraccion: 'fracción',
  dia: 'día',
  mensualidad: 'mes',
};

/** Tiempo de vida del cache en memoria para parking_info y tarifas (ms). */
const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class TicketRendererService extends TicketRendererPort {
  private readonly supabase = inject(SupabaseService);
  private readonly qzPrinter = inject(QzParkingPrinterService);
  private cachedParkingInfo: ParkingInfo | null = null;
  private cachedParkingInfoAt = 0;
  private cachedActiveTariffs: TariffEntity[] | null = null;
  private cachedActiveTariffsAt = 0;

  /** Fuerza recarga en el próximo acceso. Usar al editar tarifas o settings. */
  invalidateCache(): void {
    this.cachedParkingInfo = null;
    this.cachedParkingInfoAt = 0;
    this.cachedActiveTariffs = null;
    this.cachedActiveTariffsAt = 0;
  }

  async getParkingInfo(): Promise<ParkingInfo> {
    if (this.cachedParkingInfo && Date.now() - this.cachedParkingInfoAt < CACHE_TTL_MS) {
      return this.cachedParkingInfo;
    }
    try {
      const { data } = await this.supabase.client
        .from('app_settings')
        .select('value')
        .eq('key', 'parking_info')
        .maybeSingle();
      if (data?.value && typeof data.value === 'object') {
        const v = data.value as Partial<ParkingInfo>;
        this.cachedParkingInfo = {
          name: v.name?.trim() || FALLBACK_PARKING_INFO.name,
          nit: v.nit ?? '',
          dv: v.dv ?? '',
          address: v.address ?? '',
          phone: v.phone ?? '',
          parkingType: (v.parkingType as ParkingInfo['parkingType']) ?? '',
          resolutionNumber: v.resolutionNumber ?? '',
          closingTime: v.closingTime ?? '',
          printerName: '',
          printEntryTicketEnabled: typeof v['printEntryTicketEnabled'] === 'boolean'
            ? v['printEntryTicketEnabled']
            : true,
          printExitReceiptEnabled: typeof v['printExitReceiptEnabled'] === 'boolean'
            ? v['printExitReceiptEnabled']
            : true,
          openDrawerOnCashPayment: typeof v['openDrawerOnCashPayment'] === 'boolean'
            ? v['openDrawerOnCashPayment']
            : false,
        };
        this.cachedParkingInfoAt = Date.now();
        return this.cachedParkingInfo;
      }
    } catch {
      // Sin red o error: usar fallback. El ticket sale igual.
    }
    return FALLBACK_PARKING_INFO;
  }

  /**
   * Carga el set mínimo de tarifas activas para la tabla de tarifas del
   * ticket. Si falla, retorna []; el render omite la tabla pero NO falla.
   * Cachea en memoria para evitar refetch en cada ingreso.
   */
  private async getActiveTariffsForTicket(): Promise<TariffEntity[]> {
    if (this.cachedActiveTariffs && Date.now() - this.cachedActiveTariffsAt < CACHE_TTL_MS) {
      return this.cachedActiveTariffs;
    }
    try {
      const { data } = await this.supabase.client
        .from('tariffs')
        .select('*')
        .eq('is_active', true)
        .neq('unit', 'mensualidad');
      if (!data) return [];
      const tariffs = data.map((row: Record<string, unknown>) => new TariffEntity(
        row['id'] as string,
        new Date(row['created_at'] as string),
        new Date(row['updated_at'] as string),
        row['name'] as string,
        row['vehicle_type'] as VehicleType,
        row['unit'] as TariffEntity['unit'],
        row['value_cents'] as number,
        (row['grace_minutes'] as number) ?? 0,
        (row['daily_cap_cents'] as number) ?? 0,
        true,
        undefined,
        null,
        null,
        (row['per_minute_cents'] as number | null) ?? null,
        (row['per_hour_cents']   as number | null) ?? null,
        (row['plena_cents']      as number | null) ?? null,
      ));
      this.cachedActiveTariffs = tariffs;
      this.cachedActiveTariffsAt = Date.now();
      return tariffs;
    } catch {
      return [];
    }
  }

  async renderAndPrint(
    session: ParkingSessionEntity,
    tariffSnapshot: TariffEntity | null,
    parkingInfo?: ParkingInfo,
  ): Promise<TicketRenderResult> {
    const [info] = await Promise.all([
      parkingInfo ? Promise.resolve(parkingInfo) : this.getParkingInfo(),
      this.getActiveTariffsForTicket(),
    ]);

    if (info.printEntryTicketEnabled) {
      try {
        await this.qzPrinter.print(
          buildEscPosEntryReceipt({
            session,
            tariff: tariffSnapshot,
            info,
            qrBase64: '',
          }),
          info.printerName,
          `Parqueadero entrada ${session.vehiclePlate}`,
        );
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[print-entry] QZ failed.', error);
        return { ok: false, reason: 'qz_error', message };
      }
    }

    return {
      ok: false,
      reason: 'printer_not_configured',
      message: 'La impresión de tickets de entrada por QZ está desactivada.',
    };
  }

  /**
   * Comprobante de salida (cobro). Usado por el operator-dashboard al
   * confirmar salida y por el historial de cobros (/payments) para
   * reimprimir.
   */
  async printExitReceipt(
    r: ExitReceiptData,
    optionsOrParkingInfo?: TicketPrintOptions | ParkingInfo,
  ): Promise<TicketRenderResult> {
    const explicitParkingInfo = isParkingInfo(optionsOrParkingInfo) ? optionsOrParkingInfo : undefined;
    const options = isParkingInfo(optionsOrParkingInfo) ? {} : optionsOrParkingInfo ?? {};
    const info = explicitParkingInfo ?? await this.getParkingInfo();

    if (info.printExitReceiptEnabled) {
      try {
        await this.qzPrinter.print(
          buildEscPosExitReceipt(r, info),
          info.printerName,
          `Parqueadero salida ${r.plate}`,
          {
            openCashDrawer: options.openCashDrawer ??
              (info.openDrawerOnCashPayment && r.paymentMethod === 'efectivo' && r.amountCents > 0),
          },
        );
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[print-exit] QZ failed.', error);
        return { ok: false, reason: 'qz_error', message };
      }
    }

    return {
      ok: false,
      reason: 'printer_not_configured',
      message: 'La impresión de comprobantes de salida por QZ está desactivada.',
    };
  }

  async printSalesTicket(detail: InvoiceDetailEntity): Promise<TicketRenderResult> {
    const info = await this.getParkingInfo();

    if (info.printExitReceiptEnabled) {
      try {
        await this.qzPrinter.print(
          buildEscPosSalesTicket(detail, info),
          info.printerName,
          `Parqueadero ticket ${detail.invoice.internalNumber}`,
        );
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[print-sales-ticket] QZ failed.', error);
        return { ok: false, reason: 'qz_error', message };
      }
    }

    return {
      ok: false,
      reason: 'printer_not_configured',
      message: 'La impresión de tickets por QZ está desactivada.',
    };
  }

  async openCashDrawer(parkingInfo?: ParkingInfo): Promise<TicketRenderResult> {
    const info = parkingInfo ?? await this.getParkingInfo();
    try {
      await this.qzPrinter.openCashDrawer(info.printerName);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: 'qz_error', message };
    }
  }

  async printTestReceipt(parkingInfo?: ParkingInfo): Promise<TicketRenderResult> {
    const info = parkingInfo ?? await this.getParkingInfo();
    try {
      const sampleSession = new ParkingSessionEntity(
        'PRUEBA-ENTRADA-LOCAL',
        new Date(),
        new Date(),
        'ABC123',
        'carro',
        new Date(),
        'local-test',
        'active',
        null,
        'tarifa-prueba',
        null,
        null,
        null,
        'synced',
      );
      const sampleTariff = new TariffEntity(
        'tarifa-prueba',
        new Date(),
        new Date(),
        'Carro particular',
        'carro',
        'hora',
        500000,
        0,
        0,
        true,
        undefined,
        null,
        null,
        15000,
        500000,
        1500000,
      );
      await this.qzPrinter.print(
        buildEscPosEntryReceipt({
          session: sampleSession,
          tariff: sampleTariff,
          info,
          qrBase64: '',
        }),
        info.printerName,
        'Parqueadero prueba entrada',
      );
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: 'qz_error', message };
    }
  }

  async diagnosePrinter(parkingInfo?: ParkingInfo): Promise<QzParkingPrinterDiagnostic> {
    const info = parkingInfo ?? await this.getParkingInfo();
    return this.qzPrinter.diagnose(info.printerName);
  }

  private buildSalesHtml(detail: InvoiceDetailEntity, info: ParkingInfo): string {
    const { invoice, payment, session, customer, tariff } = detail;
    const { date: issuedDate, time: issuedTime } = splitBogotaDateTime(invoice.issuedAt);

    const parkingTypeLabel = info.parkingType === 'publico'
      ? 'PARQUEADERO PÚBLICO'
      : info.parkingType === 'privado' ? 'PARQUEADERO PRIVADO' : '';
    const nitFmt = info.nit
      ? `NIT ${escapeHtml(info.nit)}${info.dv ? '-' + escapeHtml(info.dv) : ''}`
      : '';
    const resolutionFmt = info.resolutionNumber
      ? `Resolución ${escapeHtml(info.resolutionNumber)}`
      : '';

    let sessionBlock = '';
    if (session) {
      const { date: entryDate, time: entryTime } = splitBogotaDateTime(session.entryAt);
      const exitTime = session.exitAt ? splitBogotaDateTime(session.exitAt).time : '—';
      const durationMin = detail.durationMinutes ?? 0;
      const hh = Math.floor(durationMin / 60);
      const mm = durationMin % 60;
      const durationLabel = hh > 0 ? `${hh}h ${mm}min` : `${mm}min`;
      sessionBlock = `
<div class="kv">
  <div class="label">Placa</div><div class="value plate-inline">${escapeHtml(session.vehiclePlate)}</div>
  <div class="label">Tipo</div><div class="value">${VEHICLE_TYPE_LABEL[session.vehicleType]}</div>
  <div class="label">Fecha</div><div class="value">${entryDate}</div>
  <div class="label">Entrada</div><div class="value">${entryTime}</div>
  <div class="label">Salida</div><div class="value">${exitTime}</div>
  <div class="label">Duración</div><div class="value">${durationLabel}</div>
</div>`;
    }

    const tariffLine = tariff
      ? `<div class="tariff-snapshot"><span class="ts-label">Tarifa</span><strong>${escapeHtml(buildTariffSnapshotLine(tariff))}</strong></div>`
      : '';

    const customerBlock = customer
      ? `<div class="customer">${escapeHtml(customer.name)}${customer.docNumber ? ' · ' + escapeHtml(customer.docType.toUpperCase()) + ' ' + escapeHtml(customer.docNumber) : ''}</div>`
      : '';

    const methodLabel = payment ? PAYMENT_METHOD_LABEL[payment.method] : '—';

    const totalsTable = `
<table class="totals">
  <tr><td>Subtotal</td><td class="amount">${escapeHtml(formatCOP(invoice.subtotalCents))}</td></tr>
  <tr><td>IVA</td><td class="amount">${escapeHtml(formatCOP(invoice.taxCents))}</td></tr>
  <tr class="grand"><td>TOTAL</td><td class="amount">${escapeHtml(formatCOP(invoice.totalCents))}</td></tr>
  <tr><td>Pago</td><td class="amount">${escapeHtml(methodLabel)}</td></tr>
</table>`;

    const addressBlock = info.address ? `<span class="addr">${escapeHtml(info.address)}</span>` : '';
    const phoneBlock = info.phone ? `<span class="phone">☎ ${escapeHtml(info.phone)}</span>` : '';

    return `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<title>Ticket cobro ${escapeHtml(invoice.internalNumber)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    width: 72mm; margin: 0 auto; padding: 4mm 4mm 6mm;
    font-family: 'Courier New', ui-monospace, monospace;
    color: #000; font-size: 11pt; line-height: 1.32;
  }
  .ticket-type { text-align: center; font-weight: 700; font-size: 10pt; letter-spacing: 0.06em; padding-bottom: 1mm; border-bottom: 1px dashed #000; margin-bottom: 2mm; }
  .biz-name { text-align: center; font-size: 14pt; margin: 0 0 1mm; font-weight: 800; }
  .biz-meta { text-align: center; font-size: 9pt; margin-bottom: 2mm; }
  .number-box { text-align: center; padding: 2mm 1mm; border: 1.5px solid #000; margin: 2mm 0; font-weight: 800; font-size: 12pt; letter-spacing: 0.04em; }
  .doc-label { display: block; font-size: 8pt; font-weight: 500; letter-spacing: 0.08em; margin-bottom: 0.5mm; }
  .issued { text-align: center; font-size: 9pt; margin-bottom: 2mm; }
  .customer { text-align: center; font-weight: 700; font-size: 11pt; margin: 2mm 0; }
  .kv { display: grid; grid-template-columns: auto 1fr; gap: 0.6mm 3mm; margin: 2mm 0; font-size: 10pt; }
  .kv .label { font-weight: 600; }
  .kv .value { text-align: right; }
  .plate-inline { font-weight: 800; letter-spacing: 0.08em; }
  .tariff-snapshot { text-align: center; padding: 1.5mm 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; margin: 2mm 0; font-size: 9.5pt; }
  .tariff-snapshot .ts-label { display: block; font-size: 8pt; font-weight: 600; letter-spacing: 0.08em; margin-bottom: 0.5mm; }
  .totals { width: 100%; border-collapse: collapse; margin-top: 2mm; font-size: 10.5pt; }
  .totals td { padding: 0.6mm 0; }
  .totals td.amount { text-align: right; font-variant-numeric: tabular-nums; }
  .totals tr.grand td { border-top: 1px solid #000; font-weight: 800; font-size: 12pt; padding-top: 1mm; }
  .ornament { text-align: center; margin: 3mm 0 1mm; letter-spacing: 0.4em; }
  .footer { text-align: center; font-size: 9pt; }
  .reprint-note { text-align: center; font-weight: 700; margin-top: 2mm; font-size: 9pt; letter-spacing: 0.08em; }
</style>
</head>
<body>
${parkingTypeLabel ? `<div class="ticket-type">${escapeHtml(parkingTypeLabel)}</div>` : ''}
<h1 class="biz-name">${escapeHtml(info.name)}</h1>
${(nitFmt || resolutionFmt) ? `<div class="biz-meta">${nitFmt}${nitFmt && resolutionFmt ? ' · ' : ''}${resolutionFmt}</div>` : ''}

<div class="number-box">
  <span class="doc-label">COMPROBANTE</span>
  ${escapeHtml(invoice.internalNumber)}
</div>
<div class="issued">${issuedDate} · ${issuedTime}</div>
${customerBlock}
${sessionBlock}
${tariffLine}
${totalsTable}

<div class="ornament">* * *</div>
<div class="footer">
${addressBlock}${addressBlock && phoneBlock ? '<br>' : ''}${phoneBlock}
</div>
<div class="reprint-note">REIMPRESIÓN</div>
</body>
</html>`;
  }

  private buildHtml(
    session: ParkingSessionEntity,
    tariff: TariffEntity | null,
    allTariffs: TariffEntity[],
    info: ParkingInfo,
    qrDataUrl: string,
  ): string {
    const { date: entryDate, time: entryTime } = splitBogotaDateTime(session.entryAt);

    const parkingTypeLabel = info.parkingType === 'publico'
      ? 'PARQUEADERO PÚBLICO'
      : info.parkingType === 'privado'
        ? 'PARQUEADERO PRIVADO'
        : '';

    const nitFmt = info.nit
      ? `NIT ${escapeHtml(info.nit)}${info.dv ? '-' + escapeHtml(info.dv) : ''}`
      : '';
    const resolutionFmt = info.resolutionNumber
      ? `Resolución ${escapeHtml(info.resolutionNumber)}`
      : '';

    const tariffTable = buildTariffTable(allTariffs);
    const monthlyBanner = session.isMonthly
      ? `<div class="monthly-banner">Cliente mensual</div>`
      : '';
    const tariffSnapshotLine = !session.isMonthly && tariff
      ? `<div class="tariff-snapshot"><span class="ts-label">Tu tarifa</span><strong>${escapeHtml(buildTariffSnapshotLine(tariff))}</strong></div>`
      : '';

    const addressBlock = info.address ? `<span class="addr">${escapeHtml(info.address)}</span>` : '';
    const phoneBlock = info.phone ? `<span class="phone">☎ ${escapeHtml(info.phone)}</span>` : '';
    const closingBlock = info.closingTime
      ? `<div class="closing">Hasta las ${escapeHtml(info.closingTime)}</div>`
      : '';

    return `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<title>Ticket entrada ${escapeHtml(session.vehiclePlate)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    width: 72mm;
    margin: 0 auto;
    padding: 5mm 4mm 6mm;
    font-family: 'Helvetica Neue', 'Segoe UI', Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.35;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .ticket-type {
    text-align: center;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 3px;
    color: #000;
    padding: 0 0 1.5mm;
    margin: 0 0 1.5mm;
    text-transform: uppercase;
    border-bottom: 1px dashed #000;
  }
  .biz-name {
    text-align: center;
    font-size: 16pt;
    font-weight: 900;
    margin: 1mm 0 1.5mm;
    text-transform: uppercase;
    letter-spacing: 4px;
    line-height: 1.1;
  }
  .biz-meta {
    text-align: center;
    font-size: 8.5pt;
    color: #222;
    margin: 0 0 2mm;
    line-height: 1.5;
    font-weight: 500;
  }
  .meta-sep {
    display: inline-block;
    width: 100%;
    text-align: center;
    color: #555;
    letter-spacing: 4px;
    font-size: 7pt;
    margin: 1mm 0 2mm;
  }
  .section-label {
    text-align: center;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2.5px;
    color: #555;
    margin: 3mm 0 1mm;
    position: relative;
  }
  .section-label::before,
  .section-label::after {
    content: '';
    display: inline-block;
    width: 14mm;
    height: 1px;
    background: #aaa;
    vertical-align: middle;
    margin: 0 2mm;
  }
  .plate-box {
    border: 2px solid #000;
    text-align: center;
    padding: 3mm 2mm;
    margin: 1.5mm 0 4mm;
  }
  .plate-box .plate {
    font-family: 'Courier New', 'Roboto Mono', monospace;
    font-size: 24pt;
    font-weight: 700;
    letter-spacing: 4px;
    line-height: 1;
  }
  .data-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1.4mm 3mm;
    font-size: 9.5pt;
    margin: 1mm 1mm 2.5mm;
    padding: 1.5mm 1mm;
    border-top: 1px dotted #bbb;
    border-bottom: 1px dotted #bbb;
  }
  .data-grid .label {
    font-weight: 700;
    color: #444;
    text-transform: uppercase;
    font-size: 8.5pt;
    letter-spacing: 0.8px;
  }
  .data-grid .value {
    font-family: 'Courier New', monospace;
    font-weight: 700;
    text-align: right;
  }
  hr {
    border: 0;
    border-top: 1px dashed #888;
    margin: 2.5mm 0;
  }
  .tariff-table {
    width: 100%;
    border-collapse: collapse;
    margin: 1mm 0 2mm;
    font-size: 9.5pt;
  }
  .tariff-table th, .tariff-table td {
    text-align: left;
    padding: 1mm 1mm;
  }
  .tariff-table thead th {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-top: 1.5px solid #000;
    border-bottom: 1.5px solid #000;
  }
  .tariff-table tbody tr {
    border-bottom: 1px dotted #888;
  }
  .tariff-table tbody tr:last-child {
    border-bottom: 0;
  }
  .tariff-table td.amount {
    text-align: right;
    font-family: 'Courier New', monospace;
    font-weight: 700;
  }
  .tariff-snapshot {
    text-align: center;
    font-size: 9.5pt;
    border: 1px dashed #555;
    padding: 2mm 1.5mm;
    margin: 1.5mm 0 2.5mm;
    line-height: 1.5;
  }
  .tariff-snapshot .ts-label {
    display: block;
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #666;
    margin-bottom: 0.6mm;
  }
  .tariff-snapshot strong {
    font-family: 'Courier New', monospace;
    font-size: 10.5pt;
  }
  .monthly-banner {
    text-align: center;
    font-size: 11pt;
    font-weight: 900;
    background: #fff;
    color: #000;
    padding: 2mm 1mm;
    margin: 2mm 0;
    letter-spacing: 2.5px;
    border-top: 3px double #000;
    border-bottom: 3px double #000;
    text-transform: uppercase;
  }
  .qr-wrap {
    text-align: center;
    margin: 3mm 0 1mm;
  }
  .qr-wrap img {
    display: inline-block;
    width: 130px;
    height: 130px;
    image-rendering: pixelated;
  }
  .keep-notice {
    text-align: center;
    font-size: 8.5pt;
    font-style: italic;
    margin: 1.5mm 0 2mm;
    color: #333;
    letter-spacing: 0.3px;
  }
  .ornament {
    text-align: center;
    margin: 2.5mm 0;
    color: #555;
    font-size: 9pt;
    letter-spacing: 8px;
  }
  .footer {
    text-align: center;
    font-size: 9pt;
    line-height: 1.6;
    margin-top: 1mm;
    color: #222;
  }
  .footer .addr {
    font-weight: 600;
  }
  .footer .phone {
    font-weight: 700;
    font-family: 'Courier New', monospace;
  }
  .closing {
    text-align: center;
    font-size: 10.5pt;
    font-weight: 900;
    margin-top: 2.5mm;
    padding: 2mm 1mm;
    border-top: 3px double #000;
    border-bottom: 3px double #000;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }
  .session-id {
    font-size: 6.5pt;
    text-align: center;
    word-break: break-all;
    margin-top: 2mm;
    color: #888;
  }
</style>
</head>
<body>
${parkingTypeLabel ? `<div class="ticket-type">${escapeHtml(parkingTypeLabel)}</div>` : ''}
<h1 class="biz-name">${escapeHtml(info.name)}</h1>
<div class="biz-meta">
${nitFmt}${nitFmt && resolutionFmt ? '<br>' : ''}${resolutionFmt}
</div>
<div class="meta-sep">· · ·</div>

<div class="section-label">Placa</div>
<div class="plate-box"><div class="plate">${escapeHtml(session.vehiclePlate)}</div></div>

<div class="data-grid">
  <div class="label">Tipo</div><div class="value">${VEHICLE_TYPE_LABEL[session.vehicleType]}</div>
  <div class="label">Fecha</div><div class="value">${entryDate}</div>
  <div class="label">Entrada</div><div class="value">${entryTime}</div>
</div>

${monthlyBanner}
${tariffSnapshotLine}

${tariffTable}

<div class="qr-wrap"><img src="${qrDataUrl}" alt="QR sesión"></div>
<p class="keep-notice">Conserve este ticket<br>para registrar la salida</p>

<div class="ornament">* * *</div>
<div class="footer">
${addressBlock}${addressBlock && phoneBlock ? '<br>' : ''}${phoneBlock}
</div>
${closingBlock}
<div class="session-id">${escapeHtml(session.id)}</div>
</body>
</html>`;
  }
}

function buildTariffTable(tariffs: TariffEntity[]): string {
  if (!tariffs.length) return '';
  const ordered = [...tariffs].sort((a, b) => {
    const ai = VEHICLE_TYPE_ORDER.indexOf(a.vehicleType);
    const bi = VEHICLE_TYPE_ORDER.indexOf(b.vehicleType);
    return ai - bi;
  });
  const rows = ordered
    .map((t) => {
      const label = VEHICLE_TYPE_LABEL[t.vehicleType];
      const rate = formatTieredTariff(t);
      return `<tr><td>${escapeHtml(label)}</td><td class="amount">${escapeHtml(rate)}</td></tr>`;
    })
    .join('');
  return `<div class="section-label">Tarifas vigentes</div>
<table class="tariff-table">
  <thead><tr><th>Vehículo</th><th class="amount">Valor</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function buildTariffSnapshotLine(t: TariffEntity): string {
  return formatTieredTariff(t);
}

/**
 * Formato para imprimir las 3 tarifas de parking. Si la tarifa no tiene los
 * 3 campos nuevos (legacy pre-S2), cae al formato viejo `$X/unit`.
 */
function formatTieredTariff(t: TariffEntity): string {
  if (t.perMinuteCents != null && t.perHourCents != null && t.plenaCents != null) {
    return `${formatCOP(t.perMinuteCents)}/min · ${formatCOP(t.perHourCents)}/h · plena ${formatCOP(t.plenaCents)}`;
  }
  const unit = UNIT_LABEL[t.unit];
  return `${formatCOP(t.valueCents)} / ${unit}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function splitBogotaDateTime(d: Date): { date: string; time: string } {
  const date = d.toLocaleDateString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Bogota',
  });
  const time = d.toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Bogota',
  });
  return { date, time };
}

function isParkingInfo(value: TicketPrintOptions | ParkingInfo | undefined): value is ParkingInfo {
  return Boolean(value && 'name' in value && 'parkingType' in value);
}
