import { getQzPrintErrorMessage } from './qz-print-error';

describe('getQzPrintErrorMessage', () => {
  it('muestra la causa real si QZ ya seleccionó una impresora', () => {
    const message = getQzPrintErrorMessage(
      new Error('Printer is offline'),
      '',
      'DIGITAL POS DIG-180',
    );

    expect(message).toContain('DIGITAL POS DIG-180');
    expect(message).toContain('Printer is offline');
    expect(message).not.toContain('No se pudo detectar');
  });

  it('mantiene el error de detección cuando QZ no ha seleccionado ninguna', () => {
    const message = getQzPrintErrorMessage(new Error('No printers found'), '');
    expect(message).toContain('No se pudo detectar');
  });
});
