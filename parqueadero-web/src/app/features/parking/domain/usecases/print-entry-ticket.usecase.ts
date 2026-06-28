// UseCase: PrintEntryTicketUseCase
// Spec: parqueadero-web/specs/features/parking/print-entry-ticket.spec.md
//
// Imprime el ticket térmico (80 mm) con QR de la sesión recién creada.
// No bloqueante: si falla, retorna Left pero la sesión ya existe en BD.

import { Injectable, inject } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, ServerFailure } from '../../../../core/either/failures';
import { ParkingSessionEntity } from '../entities/parking-session.entity';
import { TariffEntity } from '../entities/tariff.entity';
import { TICKET_RENDERER_TOKEN } from '../../../../core/di/injection-tokens';

export interface PrintEntryTicketParams {
  session: ParkingSessionEntity;
  tariffSnapshot: TariffEntity | null;
}

export interface PrintEntryTicketResult {
  printedAt: Date;
}

// Sin `providedIn: 'root'`: depende de TICKET_RENDERER_TOKEN, que es
// route-scoped (ver parking.routes.ts). Si lo dejamos en root, Angular
// instancia el use case en el root injector y revienta porque allí no
// hay TICKET_RENDERER_TOKEN. Se registra explícitamente en parking.routes.ts.
@Injectable()
export class PrintEntryTicketUseCase {
  private readonly renderer = inject(TICKET_RENDERER_TOKEN);

  async execute(
    params: PrintEntryTicketParams,
  ): Promise<Either<Failure, PrintEntryTicketResult>> {
    const result = await this.renderer.renderAndPrint(
      params.session,
      params.tariffSnapshot,
    );
    if (result.ok) {
      return right({ printedAt: new Date() });
    }
    if (result.reason === 'qz_error') {
      return left(new ServerFailure(result.message ?? 'No se pudo imprimir por QZ Tray.'));
    }
    return left(new ServerFailure(result.message ?? 'No se pudo generar el ticket.'));
  }
}
