import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  GET_INVOICE_DETAIL_TOKEN,
  REPRINT_TICKET_TOKEN,
} from '../../../../core/di/injection-tokens';
import { GetInvoiceDetailUseCase } from '../../domain/usecases/get-invoice-detail.usecase';
import { ReprintTicketUseCase } from '../../domain/usecases/reprint-ticket.usecase';
import { InvoiceDetailEntity } from '../../domain/entities/invoice-detail.entity';
import { ToastService } from '../../../../core/services/toast.service';

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta_credito: 'Tarjeta crédito',
  tarjeta_debito: 'Tarjeta débito',
  transferencia: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  cortesia: 'Cortesía',
  mensual: 'Mensualidad',
  error: 'Cobro corregido',
};

@Component({
  selector: 'app-invoice-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './invoice-detail.page.html',
  styleUrl: './invoice-detail.page.scss',
})
export class InvoiceDetailPageComponent implements OnInit {
  loading = signal(true);
  reprinting = signal(false);
  errorMsg = signal<string | null>(null);
  detail = signal<InvoiceDetailEntity | null>(null);

  durationLabel = computed(() => {
    const d = this.detail()?.durationMinutes;
    if (d == null) return null;
    const h = Math.floor(d / 60);
    const m = d % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  });

  methodLabel = computed(() => {
    const m = this.detail()?.paymentMethod;
    return m ? (PAYMENT_METHOD_LABEL[m] ?? m) : '—';
  });

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  constructor(
    @Inject(GET_INVOICE_DETAIL_TOKEN) private readonly getDetailUC: GetInvoiceDetailUseCase,
    @Inject(REPRINT_TICKET_TOKEN) private readonly reprintUC: ReprintTicketUseCase,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.errorMsg.set('ID de ticket no encontrado en la URL');
      this.loading.set(false);
      return;
    }
    void this.load(id);
  }

  private async load(invoiceId: string): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    const r = await this.getDetailUC.execute({ invoiceId });
    r.fold(
      (f) => {
        this.errorMsg.set(f.message);
        this.toast.error(`Error: ${f.message}`);
        this.loading.set(false);
      },
      (d) => {
        if (!d) {
          this.errorMsg.set('Ticket no encontrado');
        } else {
          this.detail.set(d);
        }
        this.loading.set(false);
      },
    );
  }

  async reprint(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    this.reprinting.set(true);
    const result = await this.reprintUC.execute({ invoiceId: d.invoice.id });
    result.fold(
      (f) => this.toast.error(`No se pudo reimprimir: ${f.message}`),
      (r) => {
        if (r.ok) this.toast.success(`Ticket ${d.invoice.internalNumber} enviado a impresión`);
        else if (r.reason === 'popup_blocked') this.toast.error('Habilita popups del navegador');
        else this.toast.error('Error renderizando el ticket');
      },
    );
    this.reprinting.set(false);
  }

  goBack(): void {
    void this.router.navigate(['/invoicing']);
  }
}
