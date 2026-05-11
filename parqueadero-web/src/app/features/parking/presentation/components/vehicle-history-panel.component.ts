// VehicleHistoryPanelComponent — dossier histórico inline para una placa.
// Spec: parqueadero-web/specs/features/parking/get-vehicle-history-stats.spec.md
//
// Recibe el VehicleHistoryStats ya cargado y un flag `loading`. No dispara
// llamadas — el page del dashboard orquesta la carga.

import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { VehicleHistoryStats } from '../../domain/entities/vehicle-history-stats.entity';
import { VehicleType } from '../../domain/entities/parking-session.entity';
import { PaymentMethod } from '../../domain/entities/payment.entity';
import { formatCOP } from '../../../../shared/utils/currency.utils';
import { formatDuration } from '../../../../shared/utils/date.utils';

const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  carro: 'Carro',
  moto: 'Moto',
  bicicleta: 'Bicicleta',
  otro: 'Otro',
};

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  tarjeta_credito: 'T. Crédito',
  tarjeta_debito: 'T. Débito',
  transferencia: 'Transf.',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  cortesia: 'Cortesía',
  error: 'Error',
  mensual: 'Mensual',
};

@Component({
  selector: 'app-vehicle-history-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vehicle-history-panel.component.html',
  styleUrl: './vehicle-history-panel.component.scss',
})
export class VehicleHistoryPanelComponent {
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() stats: VehicleHistoryStats | null = null;

  protected readonly formatCOP = formatCOP;
  protected readonly formatDuration = formatDuration;

  protected vehicleLabel(t: VehicleType): string {
    return VEHICLE_TYPE_LABEL[t] ?? t;
  }

  /** Etiqueta corta para el método de pago en la tabla. */
  protected methodLabel(m: string | null | undefined): string {
    if (!m) return '—';
    return PAYMENT_METHOD_LABEL[m as PaymentMethod] ?? m;
  }

  protected formatRelativeDate(d: Date | null): string {
    if (!d) return '—';
    const diffMs = Date.now() - d.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays <= 0) return 'hoy';
    if (diffDays === 1) return 'ayer';
    if (diffDays < 30) return `hace ${diffDays} días`;
    const months = Math.floor(diffDays / 30);
    if (months < 12) return `hace ${months} mes${months !== 1 ? 'es' : ''}`;
    const years = Math.floor(diffDays / 365);
    return `hace ${years} año${years !== 1 ? 's' : ''}`;
  }

  protected formatShortDate(d: Date): string {
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  }

  protected formatTimeShort(d: Date | null): string {
    if (!d) return '—';
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }
}
