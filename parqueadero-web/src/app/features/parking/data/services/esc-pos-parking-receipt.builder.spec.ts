import {
  buildEscPosExitReceipt,
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
