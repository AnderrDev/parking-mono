import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { OfflineBannerComponent } from './shared/components/offline-banner/offline-banner.component';

interface NavItem {
  path: string;
  label: string;
  icon: string; // SVG path data
  ariaLabel: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    path: '/parking',
    label: 'Parqueadero',
    ariaLabel: 'Ir a parqueadero',
    icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  },
  {
    path: '/cashier',
    label: 'Caja',
    ariaLabel: 'Ir a caja',
    icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z',
  },
  {
    path: '/monthly-plans',
    label: 'Mensualidades',
    ariaLabel: 'Ir a planes mensuales',
    icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  },
  {
    path: '/customers',
    label: 'Clientes',
    ariaLabel: 'Ir a clientes',
    icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  },
  {
    path: '/invoicing',
    label: 'Facturación',
    ariaLabel: 'Ir a facturación',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  },
  {
    path: '/reports',
    label: 'Reportes',
    ariaLabel: 'Ir a reportes',
    icon: 'M18 20V10 M12 20V4 M6 20v-6',
  },
  {
    path: '/tariffs',
    label: 'Tarifas',
    ariaLabel: 'Ir a tarifas',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
  },
  {
    path: '/vehicles',
    label: 'Vehículos',
    ariaLabel: 'Ir a vehículos',
    icon: 'M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-2 M14 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0 M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
  },
];

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, OfflineBannerComponent],
  template: `
    <a class="skip-link" href="#main-content">Saltar al contenido principal</a>

    <app-offline-banner />

    @if (showShell()) {
      <div class="shell">
        <nav class="sidebar" aria-label="Navegación principal">
          <div class="sidebar__brand">
            <span class="sidebar__brand-icon" aria-hidden="true">🅿</span>
            <span class="sidebar__brand-name">Parqueadero</span>
          </div>

          <ul class="sidebar__nav" role="list">
            @for (item of navItems; track item.path) {
              <li>
                <a
                  class="sidebar__link"
                  [routerLink]="item.path"
                  routerLinkActive="sidebar__link--active"
                  [attr.aria-label]="item.ariaLabel"
                >
                  <svg
                    class="sidebar__icon"
                    width="20" height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path [attr.d]="item.icon" />
                  </svg>
                  <span class="sidebar__label">{{ item.label }}</span>
                </a>
              </li>
            }
          </ul>
        </nav>

        <div class="main-wrap">
          <header class="header" role="banner">
            <h1 class="header__title" id="page-title">Sistema de Parqueadero</h1>
          </header>

          <main id="main-content" class="main" tabindex="-1">
            <router-outlet />
          </main>
        </div>
      </div>
    } @else {
      <router-outlet />
    }
  `,
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected readonly navItems = NAV_ITEMS;

  private readonly router = inject(Router);

  protected readonly showShell = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => !e.urlAfterRedirects.startsWith('/auth')),
      startWith(!this.router.url.startsWith('/auth')),
    ),
    { initialValue: !this.router.url.startsWith('/auth') },
  );
}
