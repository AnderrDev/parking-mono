import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  Signal,
  ViewContainerRef,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Dialog } from '@angular/cdk/dialog';
import { NetworkInfoService } from '../../../core/services/network-info.service';
import { SyncOrchestrator } from '../../../core/services/sync-orchestrator.service';
import { ConflictsDialogComponent } from '../conflicts-dialog/conflicts-dialog.component';

// Estados visuales (orden de severidad de mayor a menor).
type BannerState =
  | 'hidden'
  | 'conflict'
  | 'syncing'
  | 'offline-pending'
  | 'offline'
  | 'online-pending';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './offline-banner.component.html',
  styleUrl: './offline-banner.component.scss',
})
export class OfflineBannerComponent {
  private readonly networkInfo = inject(NetworkInfoService);
  protected readonly sync = inject(SyncOrchestrator);
  private readonly dialog = inject(Dialog);
  // feedback_cdk_dialog_vcr — CDK Dialog requiere AMBOS `injector`
  // (EnvironmentInjector) y `viewContainerRef` para resolver tokens
  // route-scoped sin caer en NullInjectorError. Cualquier dialog.open()
  // que se haga desde este componente DEBE pasar ambos.
  private readonly envInjector = inject(EnvironmentInjector);
  private readonly vcr = inject(ViewContainerRef);

  // Convertimos el Observable isOnline$ a signal para mantener OnPush reactivo
  // sin AsyncPipe.
  protected readonly isOnline: Signal<boolean> = toSignal(this.networkInfo.isOnline$, {
    initialValue: typeof navigator !== 'undefined' ? navigator.onLine : true,
  });

  // Computa el estado del banner según la matriz definida en el handoff.
  protected readonly state: Signal<BannerState> = computed(() => {
    if (this.sync.conflictCount() > 0) return 'conflict';
    if (this.sync.syncing()) return 'syncing';
    const online = this.isOnline();
    const pending = this.sync.pendingCount();
    if (!online && pending > 0) return 'offline-pending';
    if (!online) return 'offline';
    if (online && pending > 0) return 'online-pending';
    return 'hidden';
  });

  // Mensaje principal del banner. Plurales en español-CO.
  protected readonly message: Signal<string> = computed(() => {
    const s = this.state();
    const pending = this.sync.pendingCount();
    const conflicts = this.sync.conflictCount();
    const plural = (n: number, singular: string, plural: string): string =>
      n === 1 ? singular : plural;
    switch (s) {
      case 'conflict':
        return `${conflicts} ${plural(conflicts, 'conflicto requiere', 'conflictos requieren')} tu atención.`;
      case 'syncing':
        return 'Sincronizando…';
      case 'offline-pending':
        return `Sin conexión. ${pending} ${plural(pending, 'operación pendiente', 'operaciones pendientes')} de sincronizar.`;
      case 'offline':
        return 'Sin conexión. Las operaciones se sincronizarán cuando vuelva la red.';
      case 'online-pending':
        return `${pending} ${plural(pending, 'operación en cola', 'operaciones en cola')}…`;
      default:
        return '';
    }
  });

  // Label dinámico del botón de acción según el estado del banner.
  protected readonly actionLabel: Signal<string> = computed(() =>
    this.state() === 'conflict' ? 'Resolver conflictos' : 'Reintentar',
  );

  protected onBannerActionClick(): void {
    if (this.state() === 'conflict') {
      this.dialog.open(ConflictsDialogComponent, {
        // feedback_cdk_dialog_vcr — AMBOS son obligatorios.
        injector: this.envInjector,
        viewContainerRef: this.vcr,
        hasBackdrop: true,
        autoFocus: 'first-tabbable',
        ariaModal: true,
      });
    } else {
      void this.sync.drain();
    }
  }
}
