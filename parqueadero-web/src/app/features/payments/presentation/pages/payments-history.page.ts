// Historial de cobros — lista de pagos con filtros + reimprimir comprobante.
//
// EXCEPCIÓN TÁCTICA a Clean Architecture (2026-05-24): consulta supabase
// directo desde la page con un JOIN payments+sessions+tariffs para evitar
// extender datasource/repository/usecase solo para display. Si se requiere
// uso desde otro contexto, extraer a `payment-remote.datasource.ts`.

import {
  ChangeDetectionStrategy, Component, OnInit, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { ToastService } from '../../../../core/services/toast.service';
import {
  TICKET_RENDERER_TOKEN,
  VOID_PAYMENT_TOKEN,
} from '../../../../core/di/injection-tokens';
import { ExitReceiptData } from '../../../parking/data/services/ticket-renderer.service';
import { TicketRendererPort } from '../../../parking/domain/services/ticket-renderer.port';
import { TariffMapper, TariffModel } from '../../../parking/data/models/tariff.model';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';
import { PaymentMethod } from '../../../parking/domain/entities/payment.entity';
import { formatCOP } from '../../../../shared/utils/currency.utils';
import { VoidPaymentUseCase } from '../../domain/usecases/void-payment.usecase';

interface HistoryRow {
  paymentId: string;
  paidAt: Date;
  amountCents: number;
  method: PaymentMethod;
  status: string;
  justification: string | null;
  // Datos de sesión (puede ser null para pagos sin sesión — ej. mensualidades).
  sessionId: string | null;
  vehiclePlate: string | null;
  vehicleType: VehicleType | null;
  entryAt: Date | null;
  exitAt: Date | null;
  durationMinutes: number | null;
  // Operadores que atendieron entrada y salida.
  entryUserName: string | null;
  exitUserName: string | null;
  // Tarifa snapshot (vía session.tariff_id).
  tariffRow: TariffModel | null;
}

type PaymentStatusFilter = '' | 'completed' | 'pending' | 'refunded';

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo:         'Efectivo',
  tarjeta_credito:  'Tarjeta crédito',
  tarjeta_debito:   'Tarjeta débito',
  transferencia:    'Transferencia',
  nequi:            'Nequi',
  daviplata:        'Daviplata',
  cortesia:         'Cortesía',
  error:            'Cobro corregido',
  mensual:          'Mensualidad',
};

const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  carro: 'Carro', moto: 'Moto', bicicleta: 'Bicicleta', otro: 'Otro',
};

@Component({
  selector: 'app-payments-history-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './payments-history.page.html',
  styleUrl: './payments-history.page.scss',
})
export class PaymentsHistoryPageComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly toast = inject(ToastService);
  private readonly ticketRenderer = inject<TicketRendererPort>(TICKET_RENDERER_TOKEN);
  private readonly voidPaymentUC = inject<VoidPaymentUseCase>(VOID_PAYMENT_TOKEN);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly reprinting = signal<string | null>(null);
  protected readonly voiding = signal<string | null>(null);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly rows = signal<HistoryRow[]>([]);
  protected readonly totalCents = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = 25;
  protected readonly hasMore = signal(false);
  protected readonly expandedRowId = signal<string | null>(null);
  /** Cache de tarifas para resolver el snapshot por sesión. */
  private readonly tariffsById = new Map<string, TariffModel>();
  /** Fallback: tarifa activa por vehicle_type. Usado cuando una sesión
   *  legacy no persistió `tariff_id` (bug pre-2026-05-25). */
  private readonly activeTariffByType = new Map<VehicleType, TariffModel>();

  protected readonly filtersForm: FormGroup;

  protected readonly methodOptions = Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethod, string][];
  protected readonly statusOptions: [PaymentStatusFilter, string][] = [
    ['', 'Todos'],
    ['completed', 'Completados'],
    ['pending', 'Pendientes'],
    ['refunded', 'Anulados'],
  ];
  protected readonly formatCOP = formatCOP;

  constructor() {
    // Default: últimos 60 días para que el historial operativo no aparezca
    // vacío cuando no hubo cobros recientes.
    const today = new Date();
    const from = new Date(today.getTime() - 60 * 24 * 3600 * 1000);
    this.filtersForm = this.fb.group({
      dateFrom: [from.toISOString().slice(0, 10)],
      dateTo: [today.toISOString().slice(0, 10)],
      vehiclePlate: [''],
      method: [''],
      status: [''],
    });
  }

  ngOnInit(): void {
    void this.loadActiveTariffsForFallback();
    void this.load();
  }

  private async loadActiveTariffsForFallback(): Promise<void> {
    const { data } = await this.supabase.client
      .from('tariffs')
      .select('*')
      .eq('is_active', true)
      .eq('_deleted', false)
      .neq('unit', 'mensualidad');
    if (!data) return;
    for (const t of data as TariffModel[]) {
      this.activeTariffByType.set(t.vehicle_type as VehicleType, t);
      this.tariffsById.set(t.id, t);
    }
  }

  protected methodLabel(m: PaymentMethod): string {
    return PAYMENT_METHOD_LABEL[m] ?? m;
  }

  /** Resuelve la tarifa con la siguiente prioridad:
   *  1. Snapshot inmutable en parking_sessions (migration 00027) → fuente
   *     de verdad para el historial; sobrevive a edits de la tarifa.
   *  2. tariff_id → fila actual de tariffs (mutable, no ideal).
   *  3. Fallback por vehicle_type a la tarifa activa actual (legacy). */
  private resolveTariff(
    snapName: string | null,
    snapPerMin: number | null,
    snapPerHour: number | null,
    snapPlena: number | null,
    tariffId: string | null,
    vehicleType: VehicleType | null,
  ): TariffModel | null {
    if (snapName != null && snapPerMin != null && snapPerHour != null && snapPlena != null) {
      // Sintético: model derivado del snapshot inmutable.
      return {
        id: tariffId ?? `snapshot:${vehicleType ?? 'unknown'}`,
        name: snapName,
        vehicle_type: vehicleType ?? 'otro',
        per_minute_cents: snapPerMin,
        per_hour_cents: snapPerHour,
        plena_cents: snapPlena,
        unit: 'hora',
        value_cents: snapPerHour,
        grace_minutes: 0,
        daily_cap_cents: snapPlena,
        is_active: false,
        created_at: '',
        updated_at: '',
      } as unknown as TariffModel;
    }
    if (tariffId && this.tariffsById.has(tariffId)) return this.tariffsById.get(tariffId)!;
    if (vehicleType && this.activeTariffByType.has(vehicleType)) return this.activeTariffByType.get(vehicleType)!;
    return null;
  }

  protected vehicleLabel(vt: VehicleType | null): string {
    return vt ? (VEHICLE_TYPE_LABEL[vt] ?? vt) : '—';
  }

  protected formatDuration(min: number | null): string {
    if (min == null || min <= 0) return '—';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }


  protected applyFilters(): void {
    this.page.set(1);
    void this.load();
  }

  protected clearFilters(): void {
    const todayDate = new Date();
    const from = new Date(todayDate.getTime() - 60 * 24 * 3600 * 1000);
    this.filtersForm.reset({
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: todayDate.toISOString().slice(0, 10),
      vehiclePlate: '',
      method: '',
      status: '',
    });
    this.page.set(1);
    void this.load();
  }

  protected prevPage(): void {
    if (this.page() <= 1) return;
    this.page.update((p) => p - 1);
    void this.load();
  }

  protected nextPage(): void {
    if (!this.hasMore()) return;
    this.page.update((p) => p + 1);
    void this.load();
  }

  protected toggleExpand(rowId: string): void {
    this.expandedRowId.update((cur) => (cur === rowId ? null : rowId));
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);

    const v = this.filtersForm.value as {
      dateFrom: string;
      dateTo: string;
      vehiclePlate: string;
      method: string;
      status: PaymentStatusFilter;
    };

    const offset = (this.page() - 1) * this.pageSize;
    let query = this.supabase.client
      .from('payments')
      .select(`
        id, session_id, method, amount_cents, status, paid_at, justification,
        parking_sessions:session_id (
          vehicle_plate, vehicle_type, entry_at, exit_at, tariff_id,
          tariff_snapshot_name, tariff_snapshot_per_minute_cents,
          tariff_snapshot_per_hour_cents, tariff_snapshot_plena_cents,
          entry_user:entry_user_id ( nombre ),
          exit_user:exit_user_id ( nombre )
        )
      `, { count: 'exact' })
      .order('paid_at', { ascending: false })
      .range(offset, offset + this.pageSize - 1);

    if (v.dateFrom) {
      query = query.gte('paid_at', new Date(v.dateFrom + 'T00:00:00-05:00').toISOString());
    }
    if (v.dateTo) {
      query = query.lte('paid_at', new Date(v.dateTo + 'T23:59:59-05:00').toISOString());
    }
    if (v.method) {
      query = query.eq('method', v.method);
    }
    if (v.status) {
      query = query.eq('status', v.status);
    }
    if (v.vehiclePlate?.trim()) {
      const plate = v.vehiclePlate.trim().toUpperCase();
      query = query.eq('parking_sessions.vehicle_plate', plate);
    }

    interface JoinedRow {
      id: string;
      session_id: string | null;
      method: PaymentMethod;
      amount_cents: number;
      status: string;
      paid_at: string;
      justification: string | null;
      parking_sessions: {
        vehicle_plate: string;
        vehicle_type: VehicleType;
        entry_at: string;
        exit_at: string | null;
        tariff_id: string | null;
        tariff_snapshot_name: string | null;
        tariff_snapshot_per_minute_cents: number | null;
        tariff_snapshot_per_hour_cents: number | null;
        tariff_snapshot_plena_cents: number | null;
        entry_user: { nombre: string } | null;
        exit_user: { nombre: string } | null;
      } | null;
    }

    const { data, error, count } = await query.returns<JoinedRow[]>();

    if (error) {
      this.errorMsg.set(error.message);
      this.toast.error(`Error: ${error.message}`);
      this.loading.set(false);
      return;
    }

    // Recoger los tariff_ids faltantes y traerlos en una sola query.
    const missingTariffIds = new Set<string>();
    for (const r of data ?? []) {
      const tid = r.parking_sessions?.tariff_id;
      if (tid && !this.tariffsById.has(tid)) missingTariffIds.add(tid);
    }
    if (missingTariffIds.size > 0) {
      const { data: tdata } = await this.supabase.client
        .from('tariffs')
        .select('*')
        .in('id', Array.from(missingTariffIds));
      for (const t of (tdata ?? []) as TariffModel[]) this.tariffsById.set(t.id, t);
    }

    let totalSum = 0;
    const mapped: HistoryRow[] = (data ?? []).map((r) => {
      if (r.status === 'completed') totalSum += r.amount_cents;
      const sess = r.parking_sessions;
      const entryAt = sess?.entry_at ? new Date(sess.entry_at) : null;
      const exitAt = sess?.exit_at ? new Date(sess.exit_at) : null;
      const durationMinutes = entryAt && exitAt
        ? Math.max(0, Math.round((exitAt.getTime() - entryAt.getTime()) / 60000))
        : null;
      return {
        paymentId: r.id,
        paidAt: new Date(r.paid_at),
        amountCents: r.amount_cents,
        method: r.method,
        status: r.status,
        justification: r.justification,
        sessionId: r.session_id,
        vehiclePlate: sess?.vehicle_plate ?? null,
        vehicleType: sess?.vehicle_type ?? null,
        entryAt,
        exitAt,
        durationMinutes,
        entryUserName: sess?.entry_user?.nombre ?? null,
        exitUserName: sess?.exit_user?.nombre ?? null,
        tariffRow: this.resolveTariff(
          sess?.tariff_snapshot_name ?? null,
          sess?.tariff_snapshot_per_minute_cents ?? null,
          sess?.tariff_snapshot_per_hour_cents ?? null,
          sess?.tariff_snapshot_plena_cents ?? null,
          sess?.tariff_id ?? null,
          sess?.vehicle_type ?? null,
        ),
      };
    });

    this.rows.set(mapped);
    this.totalCents.set(totalSum);
    this.hasMore.set((count ?? 0) > offset + mapped.length);
    this.loading.set(false);
  }

  protected async reprint(row: HistoryRow, event: Event): Promise<void> {
    event.stopPropagation();
    if (!row.sessionId || !row.vehiclePlate || !row.vehicleType || !row.entryAt) {
      this.toast.error('Este pago no tiene sesión asociada (no se puede reimprimir comprobante).');
      return;
    }
    this.reprinting.set(row.paymentId);

    const receipt: ExitReceiptData = {
      plate: row.vehiclePlate,
      vehicleType: row.vehicleType,
      entryAt: row.entryAt,
      exitAt: row.exitAt ?? new Date(),
      durationMinutes: row.durationMinutes ?? 0,
      amountCents: row.amountCents,
      paymentMethod: row.method,
      cashReceivedCents: null,
      tariffSnapshot: row.tariffRow ? TariffMapper.toEntity(row.tariffRow) : null,
    };

    const result = await this.ticketRenderer.printExitReceipt(receipt);
    this.reprinting.set(null);

    if (!result.ok) {
      this.toast.error(result.message ?? 'No se pudo imprimir el comprobante por QZ Tray.');
    } else {
      this.toast.success(`Comprobante de ${row.vehiclePlate} enviado a impresión`);
    }
  }

  protected async voidPayment(row: HistoryRow, event: Event): Promise<void> {
    event.stopPropagation();
    if (row.status !== 'completed' || this.voiding()) return;

    const reason = window.prompt(
      `Motivo de anulación para ${row.vehiclePlate ?? row.paymentId}:`,
      '',
    )?.trim();
    if (!reason) return;

    this.voiding.set(row.paymentId);
    const result = await this.voidPaymentUC.execute({
      paymentId: row.paymentId,
      reason,
    });
    this.voiding.set(null);

    result.fold(
      (failure) => this.toast.error(`No se pudo anular: ${failure.message}`),
      () => {
        this.toast.success('Cobro anulado');
        void this.load();
      },
    );
  }
}
