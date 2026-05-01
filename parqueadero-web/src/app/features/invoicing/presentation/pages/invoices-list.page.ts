import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LIST_INVOICES_TOKEN,
  REISSUE_INVOICE_TOKEN,
} from '../../../../core/di/injection-tokens';
import { ListInvoicesUseCase } from '../../domain/usecases/list-invoices.usecase';
import { ReissueInvoiceUseCase } from '../../domain/usecases/reissue-invoice.usecase';
import { InvoiceEntity, DianStatus } from '../../domain/entities/invoice.entity';
import { ToastService } from '../../../../core/services/toast.service';

const STATUS_LABEL: Record<DianStatus, string> = {
  pending: 'Pendiente',
  sent: 'Enviado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  contingency: 'Contingencia',
};

@Component({
  selector: 'app-invoices-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './invoices-list.page.html',
  styleUrl: './invoices-list.page.scss',
})
export class InvoicesListPageComponent implements OnInit {
  loading = signal(true);
  reissuing = signal(false);
  errorMsg = signal<string | null>(null);
  invoices = signal<InvoiceEntity[]>([]);
  page = signal(1);
  totalPages = signal(1);

  constructor(
    @Inject(LIST_INVOICES_TOKEN) private readonly listUC: ListInvoicesUseCase,
    @Inject(REISSUE_INVOICE_TOKEN) private readonly reissueUC: ReissueInvoiceUseCase,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  statusLabel(status: DianStatus): string {
    return STATUS_LABEL[status] ?? status;
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);

    const result = await this.listUC.execute({ page: this.page(), pageSize: 20 });

    result.fold(
      (f) => {
        this.errorMsg.set(f.message);
        this.toast.error(`Error al cargar facturas: ${f.message}`);
        this.loading.set(false);
      },
      (r) => {
        this.invoices.set(r.data);
        this.totalPages.set(r.pagination.totalPages);
        this.loading.set(false);
      },
    );
  }

  prevPage(): void {
    if (this.page() <= 1) return;
    this.page.update((p) => p - 1);
    this.load();
  }

  nextPage(): void {
    if (this.page() >= this.totalPages()) return;
    this.page.update((p) => p + 1);
    this.load();
  }

  async reissue(inv: InvoiceEntity): Promise<void> {
    this.reissuing.set(true);
    const result = await this.reissueUC.execute({ invoiceId: inv.id });
    result.fold(
      (f) => {
        this.errorMsg.set(f.message);
        this.toast.error(`Reintento falló: ${f.message}`);
      },
      () => {
        this.toast.success(`Factura ${inv.number} reenviada a DIAN`);
        void this.load();
      },
    );
    this.reissuing.set(false);
  }
}
