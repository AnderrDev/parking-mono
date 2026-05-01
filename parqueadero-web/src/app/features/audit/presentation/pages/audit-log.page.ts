import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { LIST_AUDIT_TOKEN } from '../../../../core/di/injection-tokens';
import { ListAuditUseCase } from '../../domain/usecases/list-audit.usecase';
import { AuditEntryEntity, AuditAction } from '../../domain/entities/audit-entry.entity';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { ToastService } from '../../../../core/services/toast.service';
import { AuditForms } from '../forms/audit.forms';

const ENTITY_TYPES = [
  '', 'parking_sessions', 'payments', 'invoices', 'monthly_plans',
  'tariffs', 'customers', 'cashier_shifts', 'users',
];

const ACTION_LABEL: Record<AuditAction, string> = {
  INSERT: 'Crear',
  UPDATE: 'Actualizar',
  DELETE: 'Eliminar',
  VIEW: 'Ver',
};

@Component({
  selector: 'app-audit-log-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './audit-log.page.html',
  styleUrl: './audit-log.page.scss',
})
export class AuditLogPageComponent implements OnInit {
  protected readonly entries = signal<AuditEntryEntity[]>([]);
  protected readonly loading = signal(false);
  protected readonly pagination = signal<PaginationMeta | null>(null);
  protected readonly expandedId = signal<string | null>(null);

  protected readonly entityTypes = ENTITY_TYPES;
  protected readonly actions: ('' | AuditAction)[] = ['', 'INSERT', 'UPDATE', 'DELETE'];

  filterForm!: FormGroup;
  protected currentPage = 1;

  private readonly auditForms = inject(AuditForms);
  private readonly toast = inject(ToastService);

  constructor(
    @Inject(LIST_AUDIT_TOKEN) private readonly listAuditUC: ListAuditUseCase,
  ) {}

  ngOnInit(): void {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    this.filterForm = this.auditForms.createAuditFilterForm({
      dateFrom: weekAgo,
      dateTo: today,
    });
    this.load();
  }

  protected actionLabel(a: AuditAction): string {
    return ACTION_LABEL[a] ?? a;
  }

  protected toggleExpand(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  protected onApplyFilters(): void {
    this.currentPage = 1;
    this.load();
  }

  protected onPage(delta: number): void {
    const next = this.currentPage + delta;
    const total = this.pagination()?.totalPages ?? 1;
    if (next < 1 || next > total) return;
    this.currentPage = next;
    this.load();
  }

  protected jsonPreview(obj: Record<string, unknown> | null): string {
    if (!obj) return '—';
    return JSON.stringify(obj, null, 2);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const v = this.filterForm.value as {
      dateFrom: string;
      dateTo: string;
      action: '' | AuditAction;
      entityType: string;
    };

    const result = await this.listAuditUC.execute({
      dateFrom: v.dateFrom ? new Date(v.dateFrom + 'T00:00:00-05:00') : null,
      dateTo: v.dateTo ? new Date(v.dateTo + 'T23:59:59-05:00') : null,
      action: v.action || null,
      entityType: v.entityType || null,
      page: this.currentPage,
      pageSize: 50,
    });

    this.loading.set(false);
    result.fold(
      (f) => this.toast.error(`Error al cargar auditoría: ${f.message}`),
      (r) => {
        this.entries.set(r.data);
        this.pagination.set(r.pagination);
      },
    );
  }
}
