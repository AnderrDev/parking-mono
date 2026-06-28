import { formatCOP } from '../../../../shared/utils/currency.utils';
import { InvoiceDetailEntity } from '../../../invoicing/domain/entities/invoice-detail.entity';
import { ParkingSessionEntity, VehicleType } from '../../domain/entities/parking-session.entity';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import type { ExitReceiptData, ParkingInfo } from './ticket-renderer.service';
import type { QzParkingPrintChunk } from './qz-parking-printer.service';

const ESC = '\x1b';
const GS = '\x1d';

export const ESC_POS_RECEIPT_COLUMNS = 32;

const COMMAND = {
  initialize: `${ESC}@`,
  alignLeft: `${ESC}a\x00`,
  alignCenter: `${ESC}a\x01`,
  boldOn: `${ESC}E\x01`,
  boldOff: `${ESC}E\x00`,
  feedOneLine: `${ESC}d\x01`,
  feedThreeLines: `${ESC}d\x03`,
  fullCut: `${GS}V\x00`,
} as const;

const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  carro: 'Carro',
  moto: 'Moto',
  bicicleta: 'Bicicleta',
  otro: 'Otro',
};

export interface EscPosEntryReceiptInput {
  session: ParkingSessionEntity;
  tariff: TariffEntity | null;
  info: ParkingInfo;
  qrBase64: string;
}

export function buildEscPosEntryReceipt(input: EscPosEntryReceiptInput): QzParkingPrintChunk[] {
  const { date, time } = splitBogotaDateTime(input.session.entryAt);
  const output: QzParkingPrintChunk[] = baseHeader(input.info);

  output.push(
    COMMAND.alignCenter,
    COMMAND.boldOn,
    ...lines('TICKET DE ENTRADA'),
    COMMAND.boldOff,
    divider(),
    COMMAND.boldOn,
    ...lines(input.session.vehiclePlate),
    COMMAND.boldOff,
    COMMAND.alignLeft,
    ...pairLines('Tipo', VEHICLE_TYPE_LABEL[input.session.vehicleType]),
    ...pairLines('Fecha', date),
    ...pairLines('Entrada', time),
  );

  if (input.session.isMonthly) {
    output.push(divider(), COMMAND.alignCenter, COMMAND.boldOn, ...lines('CLIENTE MENSUAL'), COMMAND.boldOff);
  } else if (input.tariff) {
    output.push(divider(), ...lines(`Tarifa: ${formatTariff(input.tariff)}`));
  }

  output.push(divider(), COMMAND.alignCenter, {
    type: 'raw',
    format: 'image',
    flavor: 'base64',
    data: input.qrBase64,
    options: { language: 'ESCPOS' },
  });

  output.push(
    COMMAND.alignCenter,
    ...lines('Conserve este ticket'),
    ...lines('para registrar la salida'),
    COMMAND.alignLeft,
    ...lines(`ID: ${input.session.id}`),
    ...footer(input.info),
  );

  return output;
}

export function buildEscPosExitReceipt(receipt: ExitReceiptData, info: ParkingInfo): string[] {
  const entry = splitBogotaDateTime(receipt.entryAt);
  const exit = splitBogotaDateTime(receipt.exitAt);
  const duration = receipt.durationMinutes >= 60
    ? `${Math.floor(receipt.durationMinutes / 60)}h ${receipt.durationMinutes % 60}m`
    : `${receipt.durationMinutes} min`;

  const output = baseHeader(info);
  output.push(
    COMMAND.alignCenter,
    COMMAND.boldOn,
    ...lines('COMPROBANTE DE PAGO'),
    COMMAND.boldOff,
    divider(),
    COMMAND.boldOn,
    ...lines(receipt.plate),
    COMMAND.boldOff,
    COMMAND.alignLeft,
    ...pairLines('Tipo', VEHICLE_TYPE_LABEL[receipt.vehicleType]),
    ...pairLines('Entrada', `${entry.date} ${entry.time}`),
    ...pairLines('Salida', `${exit.date} ${exit.time}`),
    ...pairLines('Duracion', duration),
    ...pairLines('Pago', paymentMethodLabel(receipt.paymentMethod)),
  );

  if (receipt.tariffSnapshot && receipt.tariffSnapshot.unit !== 'mensualidad') {
    output.push(...lines(`Tarifa: ${formatTariff(receipt.tariffSnapshot)}`));
  }

  output.push(divider(), COMMAND.boldOn, ...pairLines('TOTAL', totalLabel(receipt.amountCents)), COMMAND.boldOff);

  if (receipt.paymentMethod === 'efectivo' && receipt.cashReceivedCents !== null && receipt.amountCents > 0) {
    output.push(
      ...pairLines('Efectivo', formatCOP(receipt.cashReceivedCents)),
      ...pairLines('Cambio', formatCOP(receipt.cashReceivedCents - receipt.amountCents)),
    );
  }

  output.push(COMMAND.alignCenter, ...lines('Gracias por su visita'), ...footer(info));
  return output;
}

export function buildEscPosSalesTicket(detail: InvoiceDetailEntity, info: ParkingInfo): string[] {
  const { invoice, payment, session, customer, tariff } = detail;
  const issued = splitBogotaDateTime(invoice.issuedAt);
  const output = baseHeader(info);

  output.push(
    COMMAND.alignCenter,
    COMMAND.boldOn,
    ...lines('TICKET INTERNO'),
    ...lines(invoice.internalNumber),
    COMMAND.boldOff,
    COMMAND.alignLeft,
    ...pairLines('Fecha', `${issued.date} ${issued.time}`),
  );

  if (customer) {
    const doc = customer.docNumber ? `${customer.docType.toUpperCase()} ${customer.docNumber}` : '';
    output.push(...lines(`Cliente: ${customer.name}${doc ? ` (${doc})` : ''}`));
  }

  if (session) {
    const entry = splitBogotaDateTime(session.entryAt);
    output.push(
      divider(),
      ...pairLines('Placa', session.vehiclePlate),
      ...pairLines('Tipo', VEHICLE_TYPE_LABEL[session.vehicleType]),
      ...pairLines('Entrada', `${entry.date} ${entry.time}`),
    );
  }

  if (tariff) output.push(...lines(`Tarifa: ${formatTariff(tariff)}`));
  output.push(
    divider(),
    ...pairLines('Subtotal', formatCOP(invoice.subtotalCents)),
    ...pairLines('IVA', formatCOP(invoice.taxCents)),
    COMMAND.boldOn,
    ...pairLines('TOTAL', formatCOP(invoice.totalCents)),
    COMMAND.boldOff,
  );
  if (payment) output.push(...pairLines('Pago', paymentMethodLabel(payment.method)));
  output.push(...footer(info));
  return output;
}

export function buildEscPosTestReceipt(info: ParkingInfo): string[] {
  const output = baseHeader(info);
  output.push(
    COMMAND.alignCenter,
    COMMAND.boldOn,
    ...lines('PRUEBA DE IMPRESION'),
    COMMAND.boldOff,
    COMMAND.alignLeft,
    divider(),
    ...pairLines('Estado', 'OK'),
    ...pairLines('Ancho', `${ESC_POS_RECEIPT_COLUMNS} cols`),
    ...footer(info),
  );
  return output;
}

function baseHeader(info: ParkingInfo): string[] {
  const output: string[] = [COMMAND.initialize, COMMAND.alignCenter, COMMAND.boldOn];
  output.push(...lines(info.name), COMMAND.boldOff);
  if (info.nit) output.push(...lines(`NIT ${info.nit}${info.dv ? `-${info.dv}` : ''}`));
  if (info.resolutionNumber) output.push(...lines(`Resolucion ${info.resolutionNumber}`));
  if (info.parkingType) {
    output.push(...lines(info.parkingType === 'publico' ? 'PARQUEADERO PUBLICO' : 'PARQUEADERO PRIVADO'));
  }
  return output;
}

function footer(info: ParkingInfo): string[] {
  const output: string[] = [divider(), COMMAND.alignCenter];
  if (info.address) output.push(...lines(info.address));
  if (info.phone) output.push(...lines(`Tel. ${info.phone}`));
  if (info.closingTime) output.push(...lines(`Cierre ${info.closingTime}`));
  output.push(COMMAND.feedThreeLines, COMMAND.fullCut);
  return output;
}

function lines(value: string): string[] {
  return wrapText(value).map((line) => `${line}\n`);
}

function pairLines(leftValue: string, rightValue: string): string[] {
  const left = sanitizeText(leftValue);
  const right = sanitizeText(rightValue);
  const spaces = ESC_POS_RECEIPT_COLUMNS - left.length - right.length;
  if (spaces >= 1) return [`${left}${' '.repeat(spaces)}${right}\n`];

  return [
    ...wrapText(left).map((line) => `${line}\n`),
    ...wrapText(right).map((line) => `${line.padStart(ESC_POS_RECEIPT_COLUMNS)}\n`),
  ];
}

function wrapText(value: string): string[] {
  const text = sanitizeText(value);
  if (!text) return [];
  const result: string[] = [];
  let current = '';

  for (const word of text.split(' ')) {
    if (word.length > ESC_POS_RECEIPT_COLUMNS) {
      if (current) result.push(current);
      for (let i = 0; i < word.length; i += ESC_POS_RECEIPT_COLUMNS) {
        result.push(word.slice(i, i + ESC_POS_RECEIPT_COLUMNS));
      }
      current = '';
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= ESC_POS_RECEIPT_COLUMNS) current = candidate;
    else {
      result.push(current);
      current = word;
    }
  }

  if (current) result.push(current);
  return result;
}

function sanitizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00d7]/g, 'x')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u00b7]/g, '-')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function divider(): string {
  return `${'-'.repeat(ESC_POS_RECEIPT_COLUMNS)}\n`;
}

function totalLabel(cents: number): string {
  return cents > 0 ? formatCOP(cents) : 'Sin cobro';
}

function formatTariff(t: TariffEntity): string {
  if (t.perMinuteCents !== null && t.perHourCents !== null && t.plenaCents !== null) {
    return `${formatCOP(t.perMinuteCents)}/min ${formatCOP(t.perHourCents)}/h plena ${formatCOP(t.plenaCents)}`;
  }
  return `${formatCOP(t.valueCents)} / ${t.unit}`;
}

function paymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    efectivo: 'Efectivo',
    tarjeta_credito: 'Tarjeta credito',
    tarjeta_debito: 'Tarjeta debito',
    transferencia: 'Transferencia',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
    cortesia: 'Cortesia',
    mensual: 'Mensualidad',
    error: 'Cobro corregido',
  };
  return labels[method] ?? method;
}

function splitBogotaDateTime(d: Date): { date: string; time: string } {
  const date = d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Bogota',
  });
  const time = d.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
  return { date, time };
}
