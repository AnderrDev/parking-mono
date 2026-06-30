import {
  ChangeDetectionStrategy, Component, input, output, TemplateRef
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';
import { ErrorDisplayComponent } from '../error-display/error-display.component';
import { SortDirection, SortParams } from '../../models/sort.model';
import { PaginationMeta } from '../../models/pagination.model';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface TableColumn<T = unknown> {
  key: string;
  label: string;
  sortable?: boolean;
  class?: string;
}

export type TableState = 'loading' | 'empty' | 'error' | 'success';

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [LoadingSpinnerComponent, ErrorDisplayComponent, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
})
export class DataTableComponent<T extends object> {
  columns          = input.required<TableColumn<T>[]>();
  rows             = input<T[]>([]);
  state            = input<TableState>('loading');
  caption          = input('Tabla de datos');
  emptyTitle       = input('Sin datos');
  emptyDescription = input('No hay registros para mostrar.');
  errorMessage     = input('Ocurrió un error al cargar los datos.');
  pagination       = input<PaginationMeta | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trackBy          = input<(row: T) => any>((row: T) => row);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cellTemplate     = input<TemplateRef<any> | null>(null);
  currentSort      = input<SortParams | null>(null);

  rowClickable = input(false);

  sortChange = output<SortParams>();
  pageChange = output<number>();
  retry      = output<void>();
  rowClick   = output<T>();

  protected readonly skeletonRows = Array.from({ length: 5 }, (_, i) => i);

  protected sortAriaLabel(key: string): 'ascending' | 'descending' | 'none' {
    const sort = this.currentSort();
    if (!sort || sort.field !== key) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sortIcon(key: string): string {
    const sort = this.currentSort();
    if (!sort || sort.field !== key) return '↕';
    return sort.direction === 'asc' ? '↑' : '↓';
  }

  // SVG path para el ícono de orden — reemplaza el carácter Unicode en el template
  protected sortIconPath(key: string): string {
    const sort = this.currentSort();
    if (!sort || sort.field !== key) return 'M8 10l4-4 4 4 M8 14l4 4 4-4';
    return sort.direction === 'asc' ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6';
  }

  protected onSort(key: string): void {
    const sort = this.currentSort();
    const direction: SortDirection =
      sort?.field === key && sort.direction === 'asc' ? 'desc' : 'asc';
    this.sortChange.emit({ field: key, direction });
  }

  protected canGoPrev(): boolean {
    const p = this.pagination();
    return p !== null && p.page > 1;
  }

  protected canGoNext(): boolean {
    const p = this.pagination();
    return p !== null && p.page < p.totalPages;
  }

  protected paginationInfo(): string {
    const p = this.pagination();
    if (!p) return '';
    const from = (p.page - 1) * p.pageSize + 1;
    const to = Math.min(p.page * p.pageSize, p.total);
    return `${from}–${to} de ${p.total}`;
  }
}
