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
import { CASHIER_REPOSITORY_TOKEN, LIST_SHIFTS_TOKEN } from '../../../../core/di/injection-tokens';
import { ListShiftsUseCase } from '../../domain/usecases/list-shifts.usecase';
import { CashierForms } from '../forms/cashier.forms';
import {
  CashierRepository,
  OperatorOption,
  ShiftWithOperator,
} from '../../domain/repositories/cashier.repository';
import { CashierShiftEntity, ShiftMethodTotal } from '../../domain/entities/cashier-shift.entity';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { ToastService } from '../../../../core/services/toast.service';
import { CurrencyCopPipe } from '../../../../shared/pipes/currency-cop.pipe';
import {
  paymentChannel,
  paymentMethodLabel,
} from '../../../../shared/utils/payment-method.utils';

const LARGE_DIFF_CENTS = 500_000;

type RangePreset = 'today' | '7d' | '30d';

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
  protected readonly operators = signal<OperatorOption[]>([]);
  protected readonly operatorsFailed = signal(false);

  filterForm!: FormGroup;
  protected currentPage = 1;

  private readonly cashierForms = inject(CashierForms);
  private readonly toast = inject(ToastService);

  constructor(
    @Inject(LIST_SHIFTS_TOKEN) private readonly listShiftsUC: ListShiftsUseCase,
    @Inject(CASHIER_REPOSITORY_TOKEN) private readonly cashierRepo: CashierRepository,
  ) {}

  ngOnInit(): void {
    const range = this.presetRange('30d');
    this.filterForm = this.cashierForms.createShiftHistoryFilterForm({
      dateFrom: range.from,
      dateTo: range.to,
      onlyWithDiff: false,
    });

    // Operador y checkbox aplican de inmediato; las fechas usan "Filtrar" o chips.
    this.filterForm.get('operatorId')!.valueChanges.subscribe(() => this.onApplyFilters());
    this.filterForm.get('onlyWithDiff')!.valueChanges.subscribe(() => this.onApplyFilters());

    this.load();
    this.loadOperators();
  }

  // ── Presets de rango ────────────────────────────────────────────────────────

  /** Fecha local Colombia (UTC-5) en formato YYYY-MM-DD. */
  private localDate(daysAgo: number): string {
    const nowBogota = new Date(Date.now() - 5 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000);
    return nowBogota.toISOString().slice(0, 10);
  }

  private presetRange(preset: RangePreset): { from: string; to: string } {
    const to = this.localDate(0);
    const from = preset === 'today' ? to : this.localDate(preset === '7d' ? 6 : 29);
    return { from, to };
  }

  protected applyPreset(preset: RangePreset): void {
    const range = this.presetRange(preset);
    this.filterForm.patchValue({ dateFrom: range.from, dateTo: range.to }, { emitEvent: false });
    this.onApplyFilters();
  }

  protected isPresetActive(preset: RangePreset): boolean {
    const range = this.presetRange(preset);
    const v = this.filterForm?.value as { dateFrom: string; dateTo: string } | undefined;
    return v?.dateFrom === range.from && v?.dateTo === range.to;
  }

  // ── Detalle expandido ───────────────────────────────────────────────────────

  protected methodLabel(method: string): string {
    return paymentMethodLabel(method);
  }

  protected channelRows(
    shift: CashierShiftEntity,
    channel: 'cash' | 'digital' | 'free',
  ): ShiftMethodTotal[] {
    return (shift.totalsByMethod ?? []).filter((t) => paymentChannel(t.method) === channel);
  }

  protected isLargeDiff(diff: number | null): boolean {
    return diff !== null && Math.abs(diff) > LARGE_DIFF_CENTS;
  }

  protected toggleExpand(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  // ── Carga ───────────────────────────────────────────────────────────────────

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

  private async loadOperators(): Promise<void> {
    const result = await this.cashierRepo.listOperators();
    result.fold(
      () => this.operatorsFailed.set(true),
      (list) => this.operators.set(list),
    );
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const v = this.filterForm.value as {
      dateFrom: string;
      dateTo: string;
      operatorId: string;
      onlyWithDiff: boolean;
    };

    const dateFrom = v.dateFrom ? new Date(v.dateFrom + 'T00:00:00-05:00') : null;
    const dateTo = v.dateTo ? new Date(v.dateTo + 'T23:59:59-05:00') : null;

    const result = await this.listShiftsUC.execute({
      userId: v.operatorId || null,
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
