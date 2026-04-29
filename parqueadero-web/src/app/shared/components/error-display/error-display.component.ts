import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type ErrorDisplayVariant = 'inline' | 'card';

@Component({
  selector: 'app-error-display',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="error-display"
      [class.error-display--card]="variant() === 'card'"
      role="alert"
      aria-live="assertive"
    >
      <svg
        class="error-display__icon"
        width="20" height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>

      <div class="error-display__content">
        <p class="error-display__message">{{ message() }}</p>
        @if (actionLabel()) {
          <button
            class="error-display__action"
            type="button"
            (click)="action.emit()"
          >
            {{ actionLabel() }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .error-display {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      color: var(--color-danger);
      font-size: var(--text-sm);
    }

    .error-display--card {
      padding: var(--space-4);
      background: var(--color-danger-soft);
      border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent);
      border-radius: var(--radius-md);
    }

    .error-display__icon {
      flex-shrink: 0;
      margin-top: 1px;
    }

    .error-display__content {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .error-display__message {
      line-height: var(--line-height-snug);
    }

    .error-display__action {
      color: var(--color-danger);
      font-weight: var(--font-weight-semibold);
      font-size: var(--text-sm);
      text-decoration: underline;
      cursor: pointer;
      padding: 0;
      min-height: var(--touch-target-min);
      display: inline-flex;
      align-items: center;

      &:focus-visible {
        outline: 2px solid var(--color-danger);
        outline-offset: 2px;
        border-radius: 2px;
      }
    }
  `],
})
export class ErrorDisplayComponent {
  message  = input.required<string>();
  variant  = input<ErrorDisplayVariant>('inline');
  actionLabel = input<string>('');
  action   = output<void>();
}
