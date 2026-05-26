import { InvoiceEntity } from './invoice.entity';
import { PaymentEntity, PaymentMethod } from '../../../parking/domain/entities/payment.entity';
import { ParkingSessionEntity } from '../../../parking/domain/entities/parking-session.entity';
import { CustomerEntity } from '../../../customers/domain/entities/customer.entity';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';

/**
 * Vista agregada para la página de detalle / reimpresión de un ticket POS.
 * Agrupa la factura interna con sus contextos relacionados (cobro, sesión,
 * cliente, tarifa aplicada). Cualquiera de los relacionados puede faltar:
 * - payment: ausente si la sesión cerró sin pago (raro, sólo por bug).
 * - session: ausente si el ticket fue manual sin sesión (futuro).
 * - tariff: ausente si la sesión es mensualidad (no aplica tarifa horaria).
 */
export class InvoiceDetailEntity {
  constructor(
    public readonly invoice: InvoiceEntity,
    public readonly payment: PaymentEntity | null,
    public readonly session: ParkingSessionEntity | null,
    public readonly customer: CustomerEntity | null,
    public readonly tariff: TariffEntity | null,
  ) {}

  get paymentMethod(): PaymentMethod | null {
    return this.payment?.method ?? null;
  }

  get vehiclePlate(): string | null {
    return this.session?.vehiclePlate ?? null;
  }

  get durationMinutes(): number | null {
    if (!this.session?.exitAt) return null;
    return Math.ceil(
      (this.session.exitAt.getTime() - this.session.entryAt.getTime()) / 60_000,
    );
  }
}
