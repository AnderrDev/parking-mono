import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="spinner"
      role="status"
      aria-live="polite"
      [attr.aria-label]="label()"
    >
      <svg
        class="spinner__svg"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          class="spinner__track"
          cx="12" cy="12" r="10"
          stroke-width="3"
        />
        <path
          class="spinner__arc"
          d="M12 2a10 10 0 0 1 10 10"
          stroke-width="3"
          stroke-linecap="round"
        />
      </svg>
      <span class="sr-only">{{ label() }}</span>
    </div>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .spinner {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .spinner__svg {
      width: 24px;
      height: 24px;
      animation: spin 0.8s linear infinite;

      @media (prefers-reduced-motion: reduce) {
        animation-duration: 2s;
      }
    }

    .spinner__track {
      stroke: var(--color-border);
    }

    .spinner__arc {
      stroke: var(--color-primary);
      transform-origin: center;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class LoadingSpinnerComponent {
  label = input('Cargando...');
}
