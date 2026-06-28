// Puerto abstracto del renderer de ticket térmico.
// Vive en domain/ porque el UseCase depende del contrato, no de la impl
// (la impl real toca DOM y vive en data/services/ticket-renderer.service.ts).

import { ParkingSessionEntity, VehicleType } from '../entities/parking-session.entity';
import { TariffEntity } from '../entities/tariff.entity';
import { InvoiceDetailEntity } from '../../../invoicing/domain/entities/invoice-detail.entity';
import { PaymentMethod } from '../entities/payment.entity';

export type TicketRenderResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'popup_blocked' | 'render_error' | 'printer_not_configured' | 'qz_error';
      message?: string;
    };

export interface TicketPrintOptions {
  openCashDrawer?: boolean;
}

export interface ExitReceiptPrintData {
  plate: string;
  vehicleType: VehicleType;
  entryAt: Date;
  exitAt: Date;
  durationMinutes: number;
  amountCents: number;
  paymentMethod: PaymentMethod;
  cashReceivedCents: number | null;
  tariffSnapshot: TariffEntity | null;
}

export abstract class TicketRendererPort {
  /** Ticket de ENTRADA (al ingresar vehículo). */
  abstract renderAndPrint(
    session: ParkingSessionEntity,
    tariffSnapshot: TariffEntity | null,
  ): Promise<TicketRenderResult>;

  abstract printExitReceipt(
    receipt: ExitReceiptPrintData,
    options?: TicketPrintOptions,
  ): Promise<TicketRenderResult>;

  /**
   * Ticket de SALIDA (comprobante de cobro). Genera HTML con totales,
   * IVA discriminado, método de pago y datos de la sesión.
   */
  abstract printSalesTicket(detail: InvoiceDetailEntity): Promise<TicketRenderResult>;

  abstract openCashDrawer(): Promise<TicketRenderResult>;

  abstract printTestReceipt(): Promise<TicketRenderResult>;
}
