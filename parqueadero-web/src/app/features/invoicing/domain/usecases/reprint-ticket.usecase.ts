import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left, right } from '../../../../core/either/either';
import {
  Failure,
  NotFoundFailure,
  ValidationFailure,
} from '../../../../core/either/failures';
import {
  INVOICING_REPOSITORY_TOKEN,
  TICKET_RENDERER_TOKEN,
} from '../../../../core/di/injection-tokens';
import { InvoicingRepository } from '../repositories/invoicing.repository';
import { TicketRendererPort, TicketRenderResult } from '../../../parking/domain/services/ticket-renderer.port';

export interface ReprintTicketParams {
  invoiceId: string;
}

@Injectable()
export class ReprintTicketUseCase extends UseCase<ReprintTicketParams, TicketRenderResult> {
  constructor(
    @Inject(INVOICING_REPOSITORY_TOKEN) private readonly repo: InvoicingRepository,
    @Inject(TICKET_RENDERER_TOKEN) private readonly renderer: TicketRendererPort,
  ) {
    super();
  }

  async execute(params: ReprintTicketParams): Promise<Either<Failure, TicketRenderResult>> {
    if (!params.invoiceId?.trim()) {
      return left(new ValidationFailure('invoiceId es requerido'));
    }
    const detailRes = await this.repo.getDetailById(params.invoiceId);
    if (detailRes.isLeft()) return left(detailRes.value);
    const detail = detailRes.value;
    if (!detail) {
      return left(new NotFoundFailure('Ticket no encontrado', 'invoice'));
    }
    const result = await this.renderer.printSalesTicket(detail);
    return right(result);
  }
}
