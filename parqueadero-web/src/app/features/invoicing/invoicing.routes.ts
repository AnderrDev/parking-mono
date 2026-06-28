import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { requireRole } from '../../core/guards/role.guard';
import {
  REPRINT_TICKET_TOKEN,
  TICKET_RENDERER_TOKEN,
} from '../../core/di/injection-tokens';
import { TicketRendererService } from '../parking/data/services/ticket-renderer.service';
import { ReprintTicketUseCase } from './domain/usecases/reprint-ticket.usecase';

// Los providers de invoicing viven en `app.config.ts` (root) para que el
// operator-dashboard pueda llamar request-invoice tras una salida.
const invoicingProviders = [
  { provide: TICKET_RENDERER_TOKEN, useClass: TicketRendererService },
  { provide: REPRINT_TICKET_TOKEN, useClass: ReprintTicketUseCase },
];

export const invoicingRoutes: Routes = [
  {
    path: '',
    providers: invoicingProviders,
    canActivate: [authGuard, requireRole('admin', 'contador')],
    loadComponent: () =>
      import('./presentation/pages/invoices-list.page').then((m) => m.InvoicesListPageComponent),
    data: { title: 'Tickets' },
  },
  {
    path: ':id',
    providers: invoicingProviders,
    canActivate: [authGuard, requireRole('admin', 'contador')],
    loadComponent: () =>
      import('./presentation/pages/invoice-detail.page').then((m) => m.InvoiceDetailPageComponent),
    data: { title: 'Detalle ticket' },
  },
];
