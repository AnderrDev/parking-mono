// Puerto abstracto del renderer de ticket térmico.
// Vive en domain/ porque el UseCase depende del contrato, no de la impl
// (la impl real integra QZ Tray y vive en data/services/ticket-renderer.service.ts).

import { ParkingSessionEntity, VehicleType } from '../entities/parking-session.entity';
import { TariffEntity } from '../entities/tariff.entity';
import { InvoiceDetailEntity } from '../../../invoicing/domain/entities/invoice-detail.entity';
import { PaymentMethod } from '../entities/payment.entity';

export type TicketRenderResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'render_error' | 'printer_not_configured' | 'qz_error';
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

/**
 * Comprobante de venta de mensualidad. Las fechas de vigencia son fechas
 * civiles (columnas DATE) y ambos extremos son inclusivos.
 */
export interface MonthlyPlanReceiptData {
  plate: string;
  /** null → se omite la línea (no se inventa "Sin cliente"). */
  customerName: string | null;
  /** Documento ya formateado, p. ej. "CC 1234567". null → se omite. */
  customerDoc: string | null;
  planType: string;
  startDate: Date;
  /** Último día cubierto, inclusive. */
  endDate: Date;
  amountCents: number;
  /** null cuando la reimpresión no logró resolver el pago. */
  paymentMethod: PaymentMethod | null;
  soldAt: Date;
  planId: string;
  /** Marca el papel como copia para que no pase por un segundo cobro. */
  isReprint?: boolean;
  /**
   * El plan fue cancelado. Sin esta marca, la reimpresión de un plan anulado
   * sale idéntica a una vigente y sirve para entrar sin cobro.
   */
  isCancelled?: boolean;
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

  /** Ticket de SALIDA (comprobante de cobro). */
  abstract printSalesTicket(detail: InvoiceDetailEntity): Promise<TicketRenderResult>;

  /** Comprobante de venta de MENSUALIDAD (vigencia + cobro). */
  abstract printMonthlyPlanReceipt(
    data: MonthlyPlanReceiptData,
  ): Promise<TicketRenderResult>;

  abstract openCashDrawer(): Promise<TicketRenderResult>;

  abstract printTestReceipt(): Promise<TicketRenderResult>;
}
