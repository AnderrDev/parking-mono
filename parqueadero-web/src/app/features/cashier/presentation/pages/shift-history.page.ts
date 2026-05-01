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
import { LIST_SHIFTS_TOKEN } from '../../../../core/di/injection-tokens';
import { ListShiftsUseCase } from '../../domain/usecases/list-shifts.usecase';
import { CashierForms } from '../forms/cashier.forms';
import { ShiftWithOperator } from '../../domain/repositories/cashier.repository';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { ToastService } from '../../../../core/services/toast.service';
import { CurrencyCopPipe } from '../../../../shared/pipes/currency-cop.pipe';

const LARGE_DIFF_CENTS = 500_000;

@Component({
  selector: 'app-shift-history-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, CurrencyCopPipe],
  templateUrl: './shift-history.page.html',
  styleUrl: './shift-history.page.scss',
})
export class ShiftHistoryPageComponent implements OnInit {
  protected readonly shifts = signal<ShiftWithOperator[]>([]);
  protected readonly loading = signal(false);
  protected readonly pagination = signal<PaginationMeta | null>(null);
  protected readonly expandedId = signal<string | null>(null);

  filterForm!: FormGroup;
  protected currentPage = 1;

  private readonly cashierForms = inject(CashierForms);
  private readonly toast = inject(ToastService);

  constructor(
    @Inject(LIST_SHIFTS_TOKEN) private readonly listShiftsUC: ListShiftsUseCase,
  ) {}

  ngOnInit(): void {
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    this.filterForm = this.cashierForms.createShiftHistoryFilterForm({
      dateFrom: monthAgo,
      dateTo: today,
      onlyWithDiff: false,
    });
    this.load();
  }

  protected isLargeDiff(diff: number | null): boolean {
    return diff !== null && Math.abs(diff) > LARGE_DIFF_CENTS;
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

  private async load(): Promise<void> {
    this.loading.set(true);
    const v = this.filterForm.value as {
      dateFrom: string;
      dateTo: string;
      onlyWithDiff: boolean;
    };

    const dateFrom = v.dateFrom ? new Date(v.dateFrom + 'T00:00:00-05:00') : null;
    const dateTo = v.dateTo ? new Date(v.dateTo + 'T23:59:59-05:00') : null;

    const result = await this.listShiftsUC.execute({
      dateFrom,
      dateTo,
      onlyWithDifference: v.onlyWithDiff,
      page: this.currentPage,
      pageSize: 25,
    });

    this.loading.set(false);
    result.fold(
      (f) => this.toast.error(`Error al cargar historial: ${f.message}`),
      (r) => {
        this.shifts.set(r.data);
        this.pagination.set(r.pagination);
      },
    );
  }
}
