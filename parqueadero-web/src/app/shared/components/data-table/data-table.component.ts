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

export type TableState = 'loading' | 'empty' | 'error' | 'offline' | 'success';

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [LoadingSpinnerComponent, ErrorDisplayComponent, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="table-container" [attr.aria-label]="caption()">

      @switch (state()) {
        @case ('loading') {
          <div class="table-state" role="status" aria-live="polite">
            <div class="table-skeleton">
              @for (row of skeletonRows; track $index) {
                <div class="table-skeleton__row">
                  @for (col of columns(); track col.key) {
                    <div class="table-skeleton__cell"></div>
                  }
                </div>
              }
            </div>
          </div>
        }

        @case ('empty') {
          <div class="table-state table-state--empty" role="status">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="3" y1="15" x2="21" y2="15"/>
            </svg>
            <p class="table-state__title">{{ emptyTitle() }}</p>
            <p class="table-state__desc">{{ emptyDescription() }}</p>
          </div>
        }

        @case ('error') {
          <div class="table-state table-state--error">
            <app-error-display
              [message]="errorMessage()"
              variant="card"
              actionLabel="Reintentar"
              (action)="retry.emit()"
            />
          </div>
        }

        @case ('offline') {
          <div class="table-state" role="status">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path d="M1 6s4-2 11-2 11 2 11 2"/>
              <path d="M5 10s3-1.5 7-1.5 7 1.5 7 1.5"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
              <circle cx="12" cy="20" r="1"/>
            </svg>
            <p class="table-state__title">Sin conexión</p>
            <p class="table-state__desc">Mostrando datos guardados localmente.</p>
          </div>
        }

        @case ('success') {
          <div class="table-wrap">
            <table class="table" [attr.aria-rowcount]="pagination()?.total">
              <caption class="sr-only">{{ caption() }}</caption>
              <thead>
                <tr>
                  @for (col of columns(); track col.key) {
                    <th
                      class="table__th"
                      [class]="col.class ?? ''"
                      scope="col"
                      [attr.aria-sort]="sortAriaLabel(col.key)"
                    >
                      @if (col.sortable) {
                        <button
                          class="table__sort-btn"
                          type="button"
                          (click)="onSort(col.key)"
                        >
                          {{ col.label }}
                          <span class="table__sort-icon" aria-hidden="true">
                            {{ sortIcon(col.key) }}
                          </span>
                        </button>
                      } @else {
                        {{ col.label }}
                      }
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track trackBy()(row)) {
                  <tr
                    class="table__row"
                    [class.table__row--clickable]="rowClick.observers.length > 0"
                    (click)="rowClick.emit(row)"
                    [attr.tabindex]="rowClick.observers.length > 0 ? 0 : null"
                    (keydown.enter)="rowClick.emit(row)"
                    (keydown.space)="rowClick.emit(row)"
                  >
                    @for (col of columns(); track col.key) {
                      <td class="table__td" [class]="col.class ?? ''">
                        <ng-container *ngTemplateOutlet="cellTemplate(); context: { $implicit: row, column: col }" />
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (pagination()) {
            <div class="table-pagination" role="navigation" aria-label="Paginación">
              <span class="table-pagination__info">
                {{ paginationInfo() }}
              </span>
              <div class="table-pagination__controls">
                <button
                  class="table-pagination__btn"
                  type="button"
                  [disabled]="!canGoPrev()"
                  aria-label="Página anterior"
                  (click)="pageChange.emit((pagination()!.page) - 1)"
                >
                  ‹
                </button>
                <span class="table-pagination__page">
                  {{ pagination()!.page }} / {{ pagination()!.totalPages }}
                </span>
                <button
                  class="table-pagination__btn"
                  type="button"
                  [disabled]="!canGoNext()"
                  aria-label="Siguiente página"
                  (click)="pageChange.emit((pagination()!.page) + 1)"
                >
                  ›
                </button>
              </div>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [`
    .table-container {
      container-type: inline-size;
      width: 100%;
    }

    // --- Estados vacío / error / offline / loading ---
    .table-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      padding: var(--space-8) var(--space-4);
      color: var(--color-text-muted);
      text-align: center;
    }

    .table-state--empty {
      color: var(--color-text-muted);
    }

    .table-state--error {
      align-items: stretch;
      padding: var(--space-4);
    }

    .table-state__title {
      font-size: var(--text-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .table-state__desc {
      font-size: var(--text-sm);
      max-width: 40ch;
    }

    // --- Skeleton ---
    .table-skeleton {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-4);
    }

    .table-skeleton__row {
      display: flex;
      gap: var(--space-3);
      height: 56px;
      align-items: center;
    }

    .table-skeleton__cell {
      flex: 1;
      height: 20px;
      border-radius: var(--radius-sm);
      background: linear-gradient(
        90deg,
        var(--color-surface-2) 25%,
        var(--color-border) 50%,
        var(--color-surface-2) 75%
      );
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.4s linear infinite;

      @media (prefers-reduced-motion: reduce) {
        animation: none;
        background: var(--color-surface-2);
      }
    }

    @keyframes skeleton-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    // --- Tabla ---
    .table-wrap {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .table {
      width: 100%;
      border-collapse: collapse;
    }

    .table__th {
      padding: var(--space-3) var(--space-4);
      text-align: left;
      font-size: var(--text-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 2px solid var(--color-border);
      white-space: nowrap;
    }

    .table__sort-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      font-weight: var(--font-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      cursor: pointer;
      transition: color var(--motion-fast) var(--ease-out);

      &:hover { color: var(--color-text); }
      &:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
        border-radius: 2px;
      }
    }

    .table__td {
      padding: var(--space-3) var(--space-4);
      font-size: var(--text-sm);
      color: var(--color-text);
      border-bottom: 1px solid var(--color-border);
      height: 56px;
      vertical-align: middle;
    }

    .table__row {
      transition: background var(--motion-fast) var(--ease-out);

      &--clickable {
        cursor: pointer;

        &:hover { background: var(--color-surface-2); }
        &:focus-visible {
          outline: 2px solid var(--color-primary);
          outline-offset: -2px;
        }
      }
    }

    // Container query: en contenedores < 600px las filas se vuelven cards
    @container (max-width: 599px) {
      .table-wrap { overflow-x: unset; }

      .table, .table thead, .table tbody, .table tr, .table th, .table td {
        display: block;
      }

      .table thead { display: none; }

      .table__row {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        margin-bottom: var(--space-3);
        padding: var(--space-3);
        height: auto;

        &--clickable:hover {
          border-color: var(--color-primary);
        }
      }

      .table__td {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-2) 0;
        height: auto;
        border-bottom: 1px solid var(--color-border);

        &:last-child { border-bottom: none; }
      }
    }

    // --- Paginación ---
    .table-pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3) var(--space-4);
      border-top: 1px solid var(--color-border);
      gap: var(--space-4);
      flex-wrap: wrap;
    }

    .table-pagination__info {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }

    .table-pagination__controls {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .table-pagination__btn {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-text);
      font-size: var(--text-lg);
      cursor: pointer;
      transition: background var(--motion-fast) var(--ease-out);
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover:not(:disabled) { background: var(--color-surface-2); }
      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      &:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }
    }

    .table-pagination__page {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
      min-width: 4ch;
      text-align: center;
    }
  `],
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
