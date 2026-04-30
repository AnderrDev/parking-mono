import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NetworkInfoService } from '../../../core/services/network-info.service';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [AsyncPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if ((networkInfo.isOnline$ | async) === false) {
      <div class="banner" role="status" aria-live="polite">
        <svg
          width="18" height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M1 6s4-2 11-2 11 2 11 2"/>
          <path d="M5 10s3-1.5 7-1.5 7 1.5 7 1.5"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
          <circle cx="12" cy="20" r="1"/>
        </svg>
        <span>
          Sin conexión. Las operaciones se sincronizan automáticamente cuando vuelva.
        </span>
      </div>
    }
  `,
  styles: [`
    .banner {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-5);
      background: var(--color-warning-soft);
      border-bottom: 2px solid var(--color-warning);
      color: var(--color-warning);
      font-size: var(--text-sm);
      font-weight: var(--font-weight-medium);
      position: sticky;
      top: 0;
      z-index: var(--z-sticky);
    }
  `],
})
export class OfflineBannerComponent {
  protected readonly networkInfo = inject(NetworkInfoService);
}
