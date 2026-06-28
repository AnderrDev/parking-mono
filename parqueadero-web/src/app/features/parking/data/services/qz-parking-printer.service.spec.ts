import {
  chooseAutoDetectedPrinter,
  createRawEscPosPrintOptions,
} from './qz-parking-printer.service';

describe('chooseAutoDetectedPrinter', () => {
  it('prioriza una impresora térmica probable sobre la predeterminada', () => {
    const result = chooseAutoDetectedPrinter(
      ['HP LaserJet', 'XP-80C', 'Microsoft Print to PDF'],
      'HP LaserJet',
    );

    expect(result).toBe('XP-80C');
  });

  it('reconoce impresoras DIGITAL POS DIG-180 como térmicas', () => {
    const result = chooseAutoDetectedPrinter(
      ['HP LaserJet', 'DIGITAL POS DIG-180'],
      'HP LaserJet',
    );

    expect(result).toBe('DIGITAL POS DIG-180');
  });

  it('usa la impresora predeterminada cuando no hay una térmica reconocible', () => {
    const result = chooseAutoDetectedPrinter(
      ['Oficina', 'Contabilidad'],
      'Contabilidad',
    );

    expect(result).toBe('Contabilidad');
  });

  it('usa la primera impresora si no hay térmica ni predeterminada', () => {
    const result = chooseAutoDetectedPrinter(['Oficina', 'PDF'], null);

    expect(result).toBe('Oficina');
  });

  it('retorna null si QZ no reporta impresoras', () => {
    expect(chooseAutoDetectedPrinter([], null)).toBeNull();
  });
});

describe('createRawEscPosPrintOptions', () => {
  it('usa encoding compatible con ESC/POS', () => {
    expect(createRawEscPosPrintOptions('Ticket', false)).toEqual({
      jobName: 'Ticket',
      encoding: 'ISO-8859-1',
    });
  });

  it('permite forzar RAW directo cuando la plataforma lo soporta', () => {
    expect(createRawEscPosPrintOptions('Ticket', true)).toEqual({
      jobName: 'Ticket',
      encoding: 'ISO-8859-1',
      forceRaw: true,
    });
  });
});
