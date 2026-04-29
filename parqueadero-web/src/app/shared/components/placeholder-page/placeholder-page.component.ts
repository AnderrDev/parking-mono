import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-placeholder-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="placeholder">
      <div class="placeholder__icon" aria-hidden="true">🚧</div>
      <h1 class="placeholder__title">{{ title() }}</h1>
      <p class="placeholder__desc">{{ description() }}</p>
    </div>
  `,
  styles: [`
    .placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      min-height: 60dvh;
      padding: var(--space-6);
      text-align: center;
    }

    .placeholder__icon {
      font-size: 3rem;
    }

    .placeholder__title {
      font-size: var(--text-xl);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .placeholder__desc {
      font-size: var(--text-md);
      color: var(--color-text-muted);
    }
  `],
})
export class PlaceholderPageComponent {
  title       = input('En construcción');
  description = input('Esta sección se implementará en una fase posterior.');
}
