// TicketRendererService — genera el HTML del ticket térmico (80 mm) con QR
// y dispara la impresión en una ventana popup. Vive en data/ porque toca DOM
// (window.open). El UseCase solo orquesta.
//
// Spec: parqueadero-web/specs/features/parking/print-entry-ticket.spec.md

import { Injectable, inject } from '@angular/core';
import * as QRCode from 'qrcode';
import { ParkingSessionEntity, VehicleType } from '../../domain/entities/parking-session.entity';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import {
  TicketRendererPort,
  TicketRenderResult,
} from '../../domain/services/ticket-renderer.port';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { formatCOP } from '../../../../shared/utils/currency.utils';

export interface ParkingInfo {
  name: string;
  nit: string;
  dv: string;
  address: string;
  phone: string;
}

const FALLBACK_PARKING_INFO: ParkingInfo = {
  name: 'Parqueadero',
  nit: '',
  dv: '',
  address: '',
  phone: '',
};

const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  carro: 'Carro',
  moto: 'Moto',
  bicicleta: 'Bicicleta',
  otro: 'Otro',
};

@Injectable({ providedIn: 'root' })
export class TicketRendererService extends TicketRendererPort {
  private readonly supabase = inject(SupabaseService);
  private cachedParkingInfo: ParkingInfo | null = null;

  async getParkingInfo(): Promise<ParkingInfo> {
    if (this.cachedParkingInfo) return this.cachedParkingInfo;
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
        };
        return this.cachedParkingInfo;
      }
    } catch {
      // Sin red o error: usar fallback. El ticket sale igual.
    }
    return FALLBACK_PARKING_INFO;
  }

  async renderAndPrint(
    session: ParkingSessionEntity,
    tariffSnapshot: TariffEntity | null,
    parkingInfo?: ParkingInfo,
  ): Promise<TicketRenderResult> {
    let qrDataUrl: string;
    try {
      qrDataUrl = await QRCode.toDataURL(session.id, {
        width: 180,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
    } catch {
      return { ok: false, reason: 'render_error' };
    }

    const info = parkingInfo ?? (await this.getParkingInfo());
    const html = this.buildHtml(session, tariffSnapshot, info, qrDataUrl);

    const w = window.open('', '_blank', 'width=380,height=620');
    if (!w) return { ok: false, reason: 'popup_blocked' };

    w.document.open();
    w.document.write(html);
    w.document.close();

    // Esperamos 200ms para que el QR <img> termine de pintar antes del print.
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    try {
      w.focus();
      w.print();
    } catch {
      // Algunos navegadores cierran la ventana automáticamente; no es crítico.
    }
    setTimeout(() => {
      try {
        w.close();
      } catch {
        /* noop */
      }
    }, 1000);
    return { ok: true };
  }

  private buildHtml(
    session: ParkingSessionEntity,
    tariff: TariffEntity | null,
    info: ParkingInfo,
    qrDataUrl: string,
  ): string {
    const entryAt = formatBogotaDateTime(session.entryAt);
    const tariffLine = tariff ? buildTariffLine(tariff) : '';
    const nitBlock = info.nit ? `NIT ${escapeHtml(info.nit)}${info.dv ? '-' + escapeHtml(info.dv) : ''}<br>` : '';
    const addressBlock = info.address ? `${escapeHtml(info.address)}<br>` : '';
    const phoneBlock = info.phone ? `Tel ${escapeHtml(info.phone)}` : '';

    return `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<title>Ticket entrada ${escapeHtml(session.vehiclePlate)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  @media print { html, body { margin: 0; padding: 0; } }
  body {
    width: 72mm;
    margin: 0 auto;
    padding: 4mm 4mm 6mm;
    font-family: 'Courier New', ui-monospace, monospace;
    font-size: 11pt;
    line-height: 1.25;
    color: #000;
  }
  h1 {
    font-size: 13pt;
    font-weight: 700;
    text-align: center;
    margin: 0 0 2mm;
    text-transform: uppercase;
  }
  .subhead { text-align: center; font-size: 9pt; margin-bottom: 2mm; }
  hr { border: 0; border-top: 1px dashed #000; margin: 3mm 0; }
  .row { display: flex; justify-content: space-between; }
  .row b { font-weight: 700; }
  .plate {
    font-size: 18pt;
    font-weight: 700;
    text-align: center;
    letter-spacing: 2px;
    margin: 2mm 0;
  }
  .tariff { font-size: 10pt; margin: 1mm 0; text-align: center; }
  .qr { text-align: center; margin: 3mm 0 1mm; }
  .qr img { width: 180px; height: 180px; image-rendering: pixelated; }
  .footer { text-align: center; font-size: 9pt; margin-top: 2mm; }
  .session-id {
    font-size: 7pt;
    text-align: center;
    word-break: break-all;
    margin-top: 1mm;
    color: #333;
  }
</style>
</head>
<body>
<h1>${escapeHtml(info.name)}</h1>
<p class="subhead">${nitBlock}${addressBlock}${phoneBlock}</p>
<hr>
<div class="plate">${escapeHtml(session.vehiclePlate)}</div>
<div class="row"><b>Tipo:</b><span>${VEHICLE_TYPE_LABEL[session.vehicleType]}</span></div>
<div class="row"><b>Entrada:</b><span>${entryAt}</span></div>
${tariffLine ? `<div class="tariff">${escapeHtml(tariffLine)}</div>` : ''}
<hr>
<div class="qr"><img src="${qrDataUrl}" alt="QR sesion"></div>
<p class="footer">Conserve este ticket para<br>registrar la salida.</p>
<div class="session-id">${escapeHtml(session.id)}</div>
</body>
</html>`;
  }
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

function formatBogotaDateTime(d: Date): string {
  const date = d.toLocaleDateString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Bogota',
  });
  const time = d.toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Bogota',
  });
  return `${date} ${time}`;
}

function buildTariffLine(t: TariffEntity): string {
  const perHour = perHourCents(t);
  const perMin = perMinuteCents(t);
  const parts: string[] = [];
  if (perMin > 0) parts.push(`${formatCOP(perMin)}/min`);
  if (perHour > 0) parts.push(`${formatCOP(perHour)}/h`);
  if (t.graceMinutes > 0) parts.push(`gracia ${t.graceMinutes} min`);
  return parts.join(' · ');
}

function perHourCents(t: TariffEntity): number {
  switch (t.unit) {
    case 'minuto': return t.valueCents * 60;
    case 'hora': return t.valueCents;
    case 'fraccion': return t.valueCents * 2;
    case 'dia': return Math.round(t.valueCents / 24);
    case 'mensualidad': return 0;
  }
}

function perMinuteCents(t: TariffEntity): number {
  switch (t.unit) {
    case 'minuto': return t.valueCents;
    case 'hora': return Math.round(t.valueCents / 60);
    case 'fraccion': return Math.round(t.valueCents / 30);
    case 'dia': return Math.round(t.valueCents / 1440);
    case 'mensualidad': return 0;
  }
}
