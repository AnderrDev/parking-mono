import {
  buildEscPosExitReceipt,
  buildEscPosMonthlyPlanReceipt,
  buildEscPosTestReceipt,
  ESC_POS_RECEIPT_COLUMNS,
} from './esc-pos-parking-receipt.builder';
import { ParkingInfo } from './ticket-renderer.service';

const parkingInfo: ParkingInfo = {
  name: 'Parqueadero Central',
  nit: '900123456',
  dv: '7',
  address: 'Calle 10 # 20-30',
  phone: '3001234567',
  parkingType: 'publico',
  resolutionNumber: '187640000',
  closingTime: '22:00',
  printerName: '',
  printEntryTicketEnabled: true,
  printExitReceiptEnabled: true,
  openDrawerOnCashPayment: true,
};

describe('ESC/POS parking receipt builder', () => {
  it('genera un recibo de salida con datos clave y corte de papel', () => {
    const chunks = buildEscPosExitReceipt(
      {
        plate: 'ABC123',
        vehicleType: 'carro',
        entryAt: new Date('2026-06-27T13:00:00-05:00'),
        exitAt: new Date('2026-06-27T15:15:00-05:00'),
        durationMinutes: 135,
        amountCents: 800000,
        paymentMethod: 'efectivo',
        cashReceivedCents: 1000000,
        tariffSnapshot: null,
      },
      parkingInfo,
    );

    const raw = chunks.join('');
    expect(raw).toContain('Parqueadero Central');
    expect(raw).toContain('COMPROBANTE DE PAGO');
    expect(raw).toContain('ABC123');
    expect(raw).toContain('TOTAL');
    expect(raw).toContain('$ 8.000');
    expect(raw).toContain('Cambio');
    expect(raw).toContain('\x1dV\x00');
  });

  // Spec: specs/features/monthly-plans/print-monthly-plan-receipt.spec.md
  it('genera el comprobante de mensualidad con vigencia y total', () => {
    const raw = buildEscPosMonthlyPlanReceipt(
      {
        plate: 'ABC123',
        customerName: 'Juan Perez',
        customerDoc: 'CC 1234567',
        planType: 'basico',
        // Fechas civiles: medianoche LOCAL, como las arma parseIsoDateOnly.
        startDate: new Date(2026, 7, 11),
        endDate: new Date(2026, 8, 10),
        amountCents: 15000000,
        paymentMethod: 'efectivo',
        soldAt: new Date('2026-08-11T15:04:00-05:00'),
        planId: 'plan-uuid',
      },
      parkingInfo,
    ).join('');

    expect(raw).toContain('COMPROBANTE MENSUALIDAD');
    expect(raw).toContain('ABC123');
    expect(raw).toContain('Juan Perez');
    expect(raw).toContain('CC 1234567');
    expect(raw).toContain('11/08/2026');
    expect(raw).toContain('10/09/2026');
    // 11-ago a 10-sep con ambos extremos inclusive.
    expect(raw).toContain('31 dias');
    expect(raw).toContain('Efectivo');
    expect(raw).toContain('$ 150.000');
    expect(raw).toContain('plan-uuid');
    expect(raw).not.toContain('REIMPRESION');
    expect(raw).toContain('\x1dV\x00');
  });

  it('marca la reimpresion y omite el pago cuando no se pudo resolver', () => {
    const raw = buildEscPosMonthlyPlanReceipt(
      {
        plate: 'XYZ789',
        customerName: null,
        customerDoc: null,
        planType: 'premium',
        startDate: new Date(2026, 7, 1),
        endDate: new Date(2026, 7, 1),
        amountCents: 5000000,
        paymentMethod: null,
        soldAt: new Date('2026-08-01T09:00:00-05:00'),
        planId: 'plan-uuid',
        isReprint: true,
      },
      parkingInfo,
    ).join('');

    expect(raw).toContain('REIMPRESION');
    expect(raw).toContain('1 dia');
    expect(raw).not.toContain('Pago');
    expect(raw).not.toContain('Cliente');
    expect(raw).not.toContain('PLAN CANCELADO');
  });

  // Sin este banner, la copia de un plan anulado sirve para entrar sin cobro.
  it('advierte cuando el plan reimpreso está cancelado', () => {
    const raw = buildEscPosMonthlyPlanReceipt(
      {
        plate: 'XYZ789',
        customerName: 'Ana Gomez',
        customerDoc: null,
        planType: 'basico',
        startDate: new Date(2026, 7, 1),
        endDate: new Date(2026, 7, 30),
        amountCents: 15000000,
        paymentMethod: 'efectivo',
        soldAt: new Date('2026-08-01T09:00:00-05:00'),
        planId: 'plan-uuid',
        isReprint: true,
        isCancelled: true,
      },
      parkingInfo,
    ).join('');

    expect(raw).toContain('PLAN CANCELADO');
    expect(raw).toContain('NO da derecho a ingreso');
  });

  it('sanitiza acentos para compatibilidad RAW ESC/POS', () => {
    const chunks = buildEscPosTestReceipt({
      ...parkingInfo,
      name: 'Parqueadero Público Ñandú',
    });

    expect(chunks.join('')).toContain('Parqueadero Publico Nandu');
  });

  it('mantiene pares izquierda/derecha dentro del ancho configurado', () => {
    const chunks = buildEscPosTestReceipt(parkingInfo);
    const lines = chunks
      .join('')
      .split('\n')
      .filter((line) => line.includes('Estado') || line.includes('Ancho'));

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.length <= ESC_POS_RECEIPT_COLUMNS)).toBeTrue();
  });
});
