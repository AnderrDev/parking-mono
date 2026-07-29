import { ChangeDetectionStrategy, Component, Inject, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';
import { AuthStateService } from './core/services/auth-state.service';
import { ToastService } from './core/services/toast.service';
import { LOGOUT_USECASE_TOKEN } from './core/di/injection-tokens';
import { LogoutUseCase } from './features/auth/domain/usecases/logout.usecase';
import { NoParams } from './core/base/usecase';

type AppRole = 'admin' | 'operador' | 'contador';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  ariaLabel: string;
  group: 'main' | 'admin';
  /** Roles que ven este link. Si se omite, todos los autenticados lo ven. */
  roles?: AppRole[];
}

const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Admin',
  operador: 'Operador',
  contador: 'Contador',
};

/**
 * Visibilidad del sidebar por rol. Debe estar alineada con los guards
 * `requireRole(...)` en las routes correspondientes — el sidebar es la
 * primera línea de defensa (UX), las routes son la segunda (seguridad).
 *
 * Si un path no aparece aquí, es visible para todos los autenticados.
 */
const NAV_ROLES: Record<string, AppRole[]> = {
  '/dashboard':       ['admin', 'contador'],
  '/payments':        ['admin', 'contador', 'operador'],
  '/tariffs':         ['admin', 'operador'],
  '/cashier/history': ['admin', 'contador'],
  '/audit':           ['admin', 'contador'],
  '/parking/history': ['admin', 'contador'],
  '/settings':        ['admin'],
  '/users':           ['admin'],
};

const NAV_ITEMS: NavItem[] = [
  // --- Operación diaria ---
  {
    path: '/parking',
    label: 'Parqueadero',
    ariaLabel: 'Ir a parqueadero',
    group: 'main',
    // Lucide: parking-square
    icon: 'M3 3h18v18H3z M9 17V7h4a3 3 0 0 1 0 6h-4',
  },
  {
    path: '/cashier',
    label: 'Caja',
    ariaLabel: 'Ir a caja',
    group: 'main',
    // Lucide: wallet
    icon: 'M21 12V7H5a2 2 0 0 1 0-4h14v4 M3 5v14a2 2 0 0 0 2 2h16v-5 M18 12a2 2 0 0 0 0 4h4v-4Z',
  },
  {
    path: '/monthly-plans',
    label: 'Mensualidades',
    ariaLabel: 'Ir a planes mensuales',
    group: 'main',
    // Lucide: calendar-clock
    icon: 'M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5 M16 2v4 M8 2v4 M3 10h18 M16 22a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z M16 14v3l1.5 1.5',
  },
  // Sección "Clientes" oculta del sidebar (2026-05-24) — el parqueadero no
  // gestiona clientes recurrentes en este alcance. La ruta /customers sigue
  // accesible directamente por URL para mantener back-compat de mensualidades
  // que aún tienen FK a customers.
  {
    path: '/vehicles',
    label: 'Vehículos',
    ariaLabel: 'Ir a vehículos',
    group: 'main',
    // Lucide: car
    icon: 'M19 17h2v-3a4 4 0 0 0-2-3.45L17.5 7A4 4 0 0 0 14 5h-4a4 4 0 0 0-3.5 2L5 10.55A4 4 0 0 0 3 14v3h2 M9 17h6 M7 17a2 2 0 1 0 0 .1Z M17 17a2 2 0 1 0 0 .1Z',
  },
  // --- Administración ---
  {
    path: '/dashboard',
    label: 'Dashboard',
    ariaLabel: 'Ir al dashboard ejecutivo',
    group: 'admin',
    // Lucide: layout-dashboard
    icon: 'M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z',
  },
  {
    path: '/payments',
    label: 'Historial cobros',
    ariaLabel: 'Ir al historial de cobros',
    group: 'admin',
    // Lucide: receipt
    icon: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z M16 8H8 M16 12H8 M13 16H8',
  },
  {
    path: '/reports',
    label: 'Reportes',
    ariaLabel: 'Ir a reportes',
    group: 'admin',
    // Lucide: bar-chart-3
    icon: 'M3 3v18h18 M7 16V9 M12 16v-5 M17 16v-3',
  },
  {
    path: '/tariffs',
    label: 'Tarifas',
    ariaLabel: 'Ir a tarifas',
    group: 'admin',
    // Lucide: tag
    icon: 'M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z M7 7h.01',
  },
  {
    path: '/cashier/history',
    label: 'Historial caja',
    ariaLabel: 'Ir al historial de turnos',
    group: 'admin',
    // Lucide: history
    icon: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M12 7v5l4 2',
  },
  {
    path: '/audit',
    label: 'Auditoría',
    ariaLabel: 'Ir a auditoría',
    group: 'admin',
    // Lucide: shield-check
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z M9 12l2 2 4-4',
  },
  {
    path: '/parking/history',
    label: 'Historial sesiones',
    ariaLabel: 'Ir al historial de sesiones',
    group: 'admin',
    // Lucide: list-ordered
    icon: 'M10 6h11 M10 12h11 M10 18h11 M4 6h1v4 M4 10h2 M6 18H4c0-1 2-2 2-3s-1-1.5-2-1',
  },
  {
    path: '/settings',
    label: 'Configuración',
    ariaLabel: 'Ir a configuración del sistema',
    group: 'admin',
    // Lucide: settings
    icon: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  },
  {
    path: '/users',
    label: 'Usuarios',
    ariaLabel: 'Ir a gestión de usuarios',
    group: 'admin',
    // Lucide: user-cog
    icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M19 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  },
];

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AsyncPipe, ToastContainerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  /** Filtra NAV_ITEMS según el rol actual del usuario.
   *  - Items sin entry en NAV_ROLES son visibles para cualquier autenticado.
   *  - Items con roles definidos solo aparecen si el rol del user está en la lista.
   *  - Sin user (pre-login) no se muestra nada — el shell tampoco se renderiza. */
  private readonly visibleNavItems = computed<NavItem[]>(() => {
    const role = this.authState.role() as AppRole | null;
    if (!role) return [];
    return NAV_ITEMS.filter((item) => {
      const allowed = NAV_ROLES[item.path];
      return !allowed || allowed.includes(role);
    });
  });

  protected readonly mainNavItems = computed(() =>
    this.visibleNavItems().filter((i) => i.group === 'main'),
  );
  protected readonly adminNavItems = computed(() =>
    this.visibleNavItems().filter((i) => i.group === 'admin'),
  );

  /** Label del brand-tag basado en el rol actual ("Admin", "Operador", "Contador"). */
  protected readonly roleLabel = computed(() => {
    const role = this.authState.role() as AppRole | null;
    return role ? ROLE_LABEL[role] : '';
  });

  private readonly router = inject(Router);
  protected readonly authState = inject(AuthStateService);
  private readonly toast = inject(ToastService);

  constructor(
    @Inject(LOGOUT_USECASE_TOKEN) private readonly logoutUC: LogoutUseCase,
  ) {}

  protected readonly currentUser = this.authState.currentUser;

  protected readonly showShell = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => !e.urlAfterRedirects.startsWith('/auth')),
      startWith(!this.router.url.startsWith('/auth')),
    ),
    { initialValue: !this.router.url.startsWith('/auth') },
  );

  protected readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => this.titleFromUrl(e.urlAfterRedirects)),
      startWith(this.titleFromUrl(this.router.url)),
    ),
    { initialValue: this.titleFromUrl(this.router.url) },
  );

  protected userInitial(): string {
    const u = this.currentUser();
    return u?.nombre?.charAt(0).toUpperCase() ?? '?';
  }

  protected async onLogout(): Promise<void> {
    const result = await this.logoutUC.execute(new NoParams());
    result.fold(
      (f) => this.toast.error(`Error al cerrar sesión: ${f.message}`),
      () => void this.router.navigate(['/auth/login']),
    );
  }

  private titleFromUrl(url: string): string {
    const item = NAV_ITEMS.find(i => url.startsWith(i.path));
    return item?.label ?? 'Sistema de Parqueadero';
  }
}
