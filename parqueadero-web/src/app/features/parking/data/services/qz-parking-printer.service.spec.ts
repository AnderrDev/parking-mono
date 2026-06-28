import { chooseAutoDetectedPrinter } from './qz-parking-printer.service';

describe('chooseAutoDetectedPrinter', () => {
  it('prioriza la impresora predeterminada cuando QZ la reporta', () => {
    const result = chooseAutoDetectedPrinter(
      ['HP LaserJet', 'XP-80C', 'Microsoft Print to PDF'],
      'HP LaserJet',
    );

    expect(result).toBe('HP LaserJet');
  });

  it('reconoce impresoras DIGITAL POS DIG-180 como térmicas', () => {
    const result = chooseAutoDetectedPrinter(
      ['HP LaserJet', 'DIGITAL POS DIG-180'],
      null,
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
