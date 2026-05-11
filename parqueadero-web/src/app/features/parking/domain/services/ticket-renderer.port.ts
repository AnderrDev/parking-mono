// Puerto abstracto del renderer de ticket térmico.
// Vive en domain/ porque el UseCase depende del contrato, no de la impl
// (la impl real toca DOM y vive en data/services/ticket-renderer.service.ts).

import { ParkingSessionEntity } from '../entities/parking-session.entity';
import { TariffEntity } from '../entities/tariff.entity';

export type TicketRenderResult =
  | { ok: true }
  | { ok: false; reason: 'popup_blocked' | 'render_error' };

export abstract class TicketRendererPort {
  abstract renderAndPrint(
    session: ParkingSessionEntity,
    tariffSnapshot: TariffEntity | null,
  ): Promise<TicketRenderResult>;
}
