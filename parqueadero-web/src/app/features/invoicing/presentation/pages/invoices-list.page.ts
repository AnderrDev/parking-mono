import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LIST_INVOICES_TOKEN,
  REPRINT_TICKET_TOKEN,
} from '../../../../core/di/injection-tokens';
import { ListInvoicesUseCase } from '../../domain/usecases/list-invoices.usecase';
import { ReprintTicketUseCase } from '../../domain/usecases/reprint-ticket.usecase';
import { ListInvoicesRow } from '../../domain/repositories/invoicing.repository';
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
  selector: 'app-invoices-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './invoices-list.page.html',
  styleUrl: './invoices-list.page.scss',
})
export class InvoicesListPageComponent implements OnInit {
  loading = signal(true);
  reprinting = signal<string | null>(null);
  errorMsg = signal<string | null>(null);
  rows = signal<ListInvoicesRow[]>([]);
  page = signal(1);
  totalPages = signal(1);

  filtersForm: FormGroup;

  protected readonly methodOptions = Object.keys(PAYMENT_METHOD_LABEL);
  protected methodLabel(m: string | null): string {
    return m ? (PAYMENT_METHOD_LABEL[m] ?? m) : '—';
  }

  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  constructor(
    @Inject(LIST_INVOICES_TOKEN) private readonly listUC: ListInvoicesUseCase,
    @Inject(REPRINT_TICKET_TOKEN) private readonly reprintUC: ReprintTicketUseCase,
    private readonly toast: ToastService,
  ) {
    this.filtersForm = this.fb.group({
      dateFrom: [''],
      dateTo: [''],
      vehiclePlate: [''],
      internalNumber: [''],
      paymentMethod: [''],
    });
  }

  ngOnInit(): void {
    this.load();
  }

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  clearFilters(): void {
    this.filtersForm.reset({
      dateFrom: '', dateTo: '', vehiclePlate: '', internalNumber: '', paymentMethod: '',
    });
    this.page.set(1);
    this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);

    const v = this.filtersForm.value;
    const result = await this.listUC.execute({
      page: this.page(),
      pageSize: 20,
      ...(v.dateFrom ? { dateFrom: new Date(v.dateFrom + 'T00:00:00-05:00') } : {}),
      ...(v.dateTo ? { dateTo: new Date(v.dateTo + 'T23:59:59-05:00') } : {}),
      ...(v.vehiclePlate ? { vehiclePlate: v.vehiclePlate } : {}),
      ...(v.internalNumber ? { internalNumber: v.internalNumber } : {}),
      ...(v.paymentMethod ? { paymentMethod: v.paymentMethod } : {}),
    });

    result.fold(
      (f) => {
        this.errorMsg.set(f.message);
        this.toast.error(`Error al cargar tickets: ${f.message}`);
        this.loading.set(false);
      },
      (r) => {
        this.rows.set(r.data);
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

  openDetail(row: ListInvoicesRow): void {
    void this.router.navigate(['/invoicing', row.invoice.id]);
  }

  async reprint(row: ListInvoicesRow, event?: Event): Promise<void> {
    event?.stopPropagation();
    this.reprinting.set(row.invoice.id);
    const result = await this.reprintUC.execute({ invoiceId: row.invoice.id });
    result.fold(
      (f) => this.toast.error(`No se pudo reimprimir: ${f.message}`),
      (r) => {
        if (r.ok) this.toast.success(`Ticket ${row.invoice.internalNumber} enviado a impresión`);
        else this.toast.error(r.message ?? 'No se pudo imprimir el ticket por QZ Tray');
      },
    );
    this.reprinting.set(null);
  }
}
