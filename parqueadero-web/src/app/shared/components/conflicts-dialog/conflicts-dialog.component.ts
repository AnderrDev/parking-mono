import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { liveQuery, Subscription as DexieSubscription } from 'dexie';
import { DatePipe } from '@angular/common';
import {
  LocalDbService,
  SyncConflict,
} from '../../../core/services/local-db.service';
import {
  ConflictResolution,
  SyncOrchestrator,
} from '../../../core/services/sync-orchestrator.service';
import { ToastService } from '../../../core/services/toast.service';

// ──────────────────────────────────────────────────────────────────────────────
// ConflictsDialog (Fase 8 Sprint 3) — lista los conflictos sin resolver de la
// outbox local y permite descartarlos o reintentarlos.
//
// Patrón:
// - Se abre desde OfflineBannerComponent cuando `state() === 'conflict'`. El
//   caller DEBE pasar `injector: EnvironmentInjector` + `viewContainerRef:
//   ViewContainerRef` al dialog.open (memoria feedback_cdk_dialog_vcr) o el
//   inyector raíz no resuelve `DialogRef`.
// - Sigue la regla feedback_dialog_inline_errors: si resolveConflict falla,
//   NO cerramos el dialog; reportamos por toast inline para que el operador
//   pueda reintentar o cancelar.
// - liveQuery() de Dexie alimenta el listado en tiempo real (otra pestaña
//   resolviendo lo refleja sin necesidad de polling).
// ──────────────────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-conflicts-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  templateUrl: './conflicts-dialog.component.html',
  styleUrl: './conflicts-dialog.component.scss',
})
export class ConflictsDialogComponent implements OnInit, OnDestroy {
  private readonly localDb = inject(LocalDbService);
  private readonly sync = inject(SyncOrchestrator);
  private readonly toast = inject(ToastService);
  private readonly dialogRef = inject(DialogRef<void>);

  protected readonly conflicts = signal<SyncConflict[]>([]);
  protected readonly expandedOpId = signal<string | null>(null);
  protected readonly processingOpId = signal<string | null>(null);
  protected readonly loaded = signal(false);
  protected readonly count = computed(() => this.conflicts().length);

  private liveSub?: DexieSubscription;

  ngOnInit(): void {
    this.liveSub = liveQuery(() =>
      this.localDb.getDB().conflicts.orderBy('detectedAt').reverse().toArray(),
    ).subscribe({
      next: (rows) => {
        this.conflicts.set(rows);
        this.loaded.set(true);
        // Si la última operación resuelta dejó el listado vacío, cerrar.
        if (rows.length === 0 && this.processingOpId() == null) {
          this.dialogRef.close();
        }
      },
      error: (err) => {
        console.warn('[conflicts-dialog] liveQuery falló', err);
        this.loaded.set(true);
      },
    });
  }

  ngOnDestroy(): void {
    this.liveSub?.unsubscribe();
  }

  protected toggle(opId: string): void {
    this.expandedOpId.set(this.expandedOpId() === opId ? null : opId);
  }

  protected isExpanded(opId: string): boolean {
    return this.expandedOpId() === opId;
  }

  protected isProcessing(opId: string): boolean {
    return this.processingOpId() === opId;
  }

  protected async onResolve(
    opId: string,
    resolution: ConflictResolution,
  ): Promise<void> {
    if (this.processingOpId() != null) return;
    this.processingOpId.set(opId);
    try {
      await this.sync.resolveConflict(opId, resolution);
      this.toast.success(
        resolution === 'discard'
          ? 'Operación descartada'
          : 'Reintentando sincronización…',
      );
    } catch (e) {
      // feedback_dialog_inline_errors — NO cerrar el dialog si falla el
      // backend; el operador puede volver a intentar.
      this.toast.error(`No se pudo resolver el conflicto: ${String(e)}`);
    } finally {
      this.processingOpId.set(null);
    }
  }

  protected close(): void {
    this.dialogRef.close();
  }

  protected pretty(value: unknown): string {
    try {
      return JSON.stringify(value ?? null, null, 2);
    } catch {
      return String(value);
    }
  }

  protected tableLabel(table: string): string {
    switch (table) {
      case 'parking_sessions':
        return 'Sesión de parqueo';
      case 'payments':
        return 'Pago';
      case 'cashier_shifts':
        return 'Turno de caja';
      case 'cash_withdrawals':
        return 'Retiro de caja';
      default:
        return table;
    }
  }

  protected reasonLabel(reason: string): string {
    if (!reason) return 'Conflicto sin detalle';
    if (reason === 'STALE_WRITE' || reason.includes('STALE_WRITE')) {
      return 'El servidor tiene una versión más reciente de este registro.';
    }
    if (reason.toLowerCase().includes('uq_sessions_active')) {
      return 'Ya existe una sesión activa para esta placa en el servidor.';
    }
    if (reason.toLowerCase().includes('uq_shifts_open')) {
      return 'Ya existe un turno de caja abierto para este operador.';
    }
    return reason;
  }
}
