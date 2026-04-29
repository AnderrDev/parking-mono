import {
  ChangeDetectionStrategy, Component, input, output, OnInit, OnDestroy
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

@Component({
  selector: 'app-search-input',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="search">
      <label class="sr-only" [attr.for]="inputId()">{{ label() }}</label>

      <div class="search__wrap">
        <svg
          class="search__icon"
          width="18" height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>

        <input
          class="search__input"
          type="search"
          [id]="inputId()"
          [placeholder]="placeholder()"
          [(ngModel)]="rawValue"
          (ngModelChange)="push($event)"
        />

        @if (rawValue) {
          <button
            class="search__clear"
            type="button"
            aria-label="Limpiar búsqueda"
            (click)="clear()"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .search {
      width: 100%;
    }

    .search__wrap {
      position: relative;
      display: flex;
      align-items: center;
    }

    .search__icon {
      position: absolute;
      left: var(--space-4);
      color: var(--color-text-muted);
      pointer-events: none;
    }

    .search__input {
      width: 100%;
      height: var(--touch-target-secondary);
      padding: 0 var(--space-4) 0 calc(var(--space-4) + 18px + var(--space-2));
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text);
      font-size: var(--text-md);
      transition: border-color var(--motion-fast) var(--ease-out);

      &::placeholder { color: var(--color-text-disabled); }

      &:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px var(--color-primary-soft);
      }

      // Quitar icono nativo de search en webkit
      &::-webkit-search-cancel-button { display: none; }
    }

    .search__clear {
      position: absolute;
      right: var(--space-3);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-pill);
      color: var(--color-text-muted);
      cursor: pointer;
      transition: background var(--motion-fast) var(--ease-out);

      &:hover { background: var(--color-surface-2); }
      &:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 1px;
      }
    }
  `],
})
export class SearchInputComponent implements OnInit, OnDestroy {
  label       = input('Buscar');
  placeholder = input('Buscar...');
  inputId     = input('search-input');
  debounce    = input(300);

  searched = output<string>();

  protected rawValue = '';

  private readonly push$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.push$.pipe(
      debounceTime(this.debounce()),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe((v) => this.searched.emit(v));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected push(value: string): void {
    this.push$.next(value);
  }

  protected clear(): void {
    this.rawValue = '';
    this.push$.next('');
    this.searched.emit('');
  }
}
