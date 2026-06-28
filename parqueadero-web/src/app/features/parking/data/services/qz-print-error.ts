export function getQzPrintErrorMessage(error: unknown, configuredPrinterName: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes('sign') ||
    normalized.includes('certificate') ||
    normalized.includes('qz-sign') ||
    normalized.includes('edge function') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('cors')
  ) {
    return 'No se pudo autorizar la impresión. Revisa la conexión a internet y la función qz-sign.';
  }

  if (
    normalized.includes('denied') ||
    normalized.includes('blocked') ||
    normalized.includes('untrusted') ||
    normalized.includes('not allowed')
  ) {
    return 'QZ Tray rechazó la solicitud. Abre QZ Tray y autoriza este sitio para imprimir.';
  }

  if (
    normalized.includes('websocket') ||
    normalized.includes('connect') ||
    normalized.includes('qz tray')
  ) {
    return 'QZ Tray no está instalado o abierto. Abre QZ Tray y vuelve a intentarlo.';
  }

  if (normalized.includes('printer') || normalized.includes('impresora')) {
    return `No se encontró la impresora configurada "${configuredPrinterName}" en este equipo.`;
  }

  if (normalized.includes('image') || normalized.includes('qr')) {
    return 'No se pudo preparar la imagen del ticket. Recarga la aplicación y vuelve a intentarlo.';
  }

  return `No se pudo enviar el comando a la impresora: ${message}`;
}
