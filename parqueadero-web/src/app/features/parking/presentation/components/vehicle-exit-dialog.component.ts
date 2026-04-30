import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  input,
  output,
  signal,
} from '@angular/core';
import { FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ParkingForms } from '../forms/parking.forms';
import { ParkingSessionEntity } from '../../domain/entities/parking-session.entity';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import { PaymentMethod, FREE_PAYMENT_METHODS } from '../../domain/entities/payment.entity';
import { CalculateParkingFeeResult } from '../../domain/usecases/calculate-parking-fee.usecase';
import { formatDuration } from '../../../../shared/utils/date.utils';

export interface ExitFormValue {
  paymentMethod: PaymentMethod;
  justification: string;
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  tarjeta_credito: 'Tarjeta Crédito',
  tarjeta_debito: 'Tarjeta Débito',
  transferencia: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  cortesia: 'Cortesía',
  error: 'Error de entrada',
  mensual: 'Plan mensual',
};

function formatCOP(amountCents: number): string {
  return `$${amountCents.toLocaleString('es-CO')}`;
}

@Component({
  selector: 'app-vehicle-exit-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="exit-dialog-title">
      <div class="dialog">
        <!-- Header -->
        <header class="dialog__header">
          <h2 id="exit-dialog-title" class="dialog__title">Registrar Salida</h2>
          <button type="button" class="dialog__close" (click)="onCancel()" aria-label="Cerrar">×</button>
        </header>

        <!-- Session summary -->
        <div class="dialog__session">
          <div class="session-plate">{{ session().vehiclePlate }}</div>
          <div class="session-meta">
            <span class="session-type">{{ session().vehicleType }}</span>
            @if (session().isMonthly) {
              <span class="session-monthly">MENSUAL</span>
            }
          </div>
          <div class="session-times">
            <span>Entrada: {{ formatEntryTime() }}</span>
            <span>Duración: {{ formatDuration(session().durationMinutes) }}</span>
          </div>
        </div>

        <!-- Fee breakdown -->
        @if (feeResult()) {
          <div class="dialog__fee" [class.dialog__fee--free]="feeResult()!.amountCents === 0">
            @if (feeResult()!.reason === 'grace') {
              <div class="fee-label">Sin cobro — dentro de los {{ feeResult()!.breakdown.grace }} min de gracia</div>
            } @else if (feeResult()!.reason === 'monthly') {
              <div class="fee-label">Sin cobro — plan mensual activo</div>
            } @else {
              <div class="fee-amount">{{ formatCOP(feeResult()!.amountCents) }}</div>
              <div class="fee-unit">{{ tariff() ? tariff()!.name : '' }}</div>
            }
          </div>
        }

        <!-- Form -->
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="dialog__form">
          <div class="form-field">
            <label class="form-label" for="paymentMethod">Método de pago *</label>
            <select
              id="paymentMethod"
              class="form-select"
              formControlName="paymentMethod"
              (change)="onMethodChange()"
            >
              @for (entry of paymentMethodEntries; track entry.value) {
                <option [value]="entry.value">{{ entry.label }}</option>
              }
            </select>
          </div>

          @if (showJustification()) {
            <div class="form-field">
              <label class="form-label" for="justification">Justificación *</label>
              <input
                id="justification"
                type="text"
                class="form-input"
                formControlName="justification"
                placeholder="Razón del cobro especial o cortesía"
                [attr.aria-required]="true"
              />
              @if (form.get('justification')?.invalid && form.get('justification')?.touched) {
                <span class="form-error">La justificación es obligatoria</span>
              }
            </div>
          }

          <div class="dialog__actions">
            <button
              type="button"
              class="btn btn--secondary"
              (click)="onCancel()"
              [disabled]="loading()"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="btn btn--primary"
              [disabled]="form.invalid || loading()"
            >
              {{ loading() ? 'Registrando...' : 'Confirmar Salida' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      z-index: 1000;
      padding: var(--space-4);
      animation: fadeIn var(--motion-duration-fast) var(--motion-easing-standard);

      @media (min-width: 600px) {
        align-items: center;
      }
    }

    .dialog {
      background: var(--color-surface);
      border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      width: 100%;
      max-width: 480px;
      max-height: 90dvh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      padding: var(--space-6);
      animation: slideUp var(--motion-duration-normal) var(--motion-easing-standard);

      @media (min-width: 600px) {
        border-radius: var(--radius-xl);
        max-height: 80dvh;
      }
    }

    .dialog__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .dialog__title {
      font-size: var(--text-xl);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      margin: 0;
    }

    .dialog__close {
      font-size: var(--text-2xl);
      line-height: 1;
      padding: var(--space-1);
      color: var(--color-text-secondary);
      cursor: pointer;
      border-radius: var(--radius-sm);
      &:hover { color: var(--color-text-primary); }
    }

    .dialog__session {
      background: var(--color-bg-subtle);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .session-plate {
      font-family: var(--font-mono);
      font-size: var(--text-2xl);
      font-weight: var(--font-weight-bold);
      letter-spacing: 0.1em;
      color: var(--color-text-primary);
    }

    .session-meta {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .session-type {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      text-transform: capitalize;
    }

    .session-monthly {
      font-size: var(--text-xs);
      font-weight: var(--font-weight-bold);
      background: color-mix(in srgb, var(--color-monthly, #7c3aed) 15%, transparent);
      color: var(--color-monthly, #7c3aed);
      padding: 2px var(--space-2);
      border-radius: var(--radius-sm);
    }

    .session-times {
      display: flex;
      gap: var(--space-4);
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
    }

    .dialog__fee {
      background: color-mix(in srgb, var(--color-danger) 8%, transparent);
      border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      text-align: center;

      &--free {
        background: color-mix(in srgb, var(--color-success) 8%, transparent);
        border-color: color-mix(in srgb, var(--color-success) 30%, transparent);
      }
    }

    .fee-amount {
      font-size: var(--text-3xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      font-variant-numeric: tabular-nums;
    }

    .fee-unit {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
    }

    .fee-label {
      font-size: var(--text-base);
      font-weight: var(--font-weight-medium);
      color: var(--color-success);
    }

    .dialog__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .form-label {
      font-size: var(--text-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-primary);
    }

    .form-select,
    .form-input {
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      font-size: var(--text-base);
      color: var(--color-text-primary);
      width: 100%;
      min-height: 44px;

      &:focus {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
        border-color: var(--color-primary);
      }
    }

    .form-error {
      font-size: var(--text-xs);
      color: var(--color-danger);
    }

    .dialog__actions {
      display: flex;
      gap: var(--space-3);
      margin-top: var(--space-2);
    }

    .btn {
      flex: 1;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      font-size: var(--text-base);
      font-weight: var(--font-weight-semibold);
      min-height: 48px;
      cursor: pointer;
      transition: background var(--motion-duration-fast);

      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    .btn--primary {
      background: var(--color-primary);
      color: #fff;
      &:not(:disabled):hover { background: var(--color-primary-dark, color-mix(in srgb, var(--color-primary) 85%, #000)); }
    }

    .btn--secondary {
      background: var(--color-bg-subtle);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border);
      &:not(:disabled):hover { background: var(--color-bg-muted, var(--color-bg-subtle)); }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }
  `],
})
export class VehicleExitDialogComponent implements OnInit, OnDestroy {
  readonly session = input.required<ParkingSessionEntity>();
  readonly tariff = input<TariffEntity | null>(null);
  readonly feeResult = input<CalculateParkingFeeResult | null>(null);
  readonly loading = input(false);

  readonly submitted = output<ExitFormValue>();
  readonly cancelled = output<void>();

  form!: FormGroup;
  readonly showJustification = signal(false);

  readonly paymentMethodEntries = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
    value: value as PaymentMethod,
    label,
  }));

  readonly formatDuration = formatDuration;
  readonly formatCOP = formatCOP;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly parkingForms: ParkingForms) {}

  ngOnInit(): void {
    this.form = this.parkingForms.createExitForm();
    this.form.patchValue({
      plate: this.session().vehiclePlate,
      vehicleType: this.session().vehicleType,
      paymentMethod: this.session().isMonthly ? 'mensual' : 'efectivo',
    });

    // Sync showJustification with the payment method control
    this.form.get('paymentMethod')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((method: PaymentMethod) => {
        const isFree = FREE_PAYMENT_METHODS.includes(method);
        this.showJustification.set(isFree);
        const jc = this.form.get('justification')!;
        if (isFree) {
          jc.setValidators([Validators.required]);
        } else {
          jc.clearValidators();
          jc.setValue('');
        }
        jc.updateValueAndValidity({ emitEvent: false });
      });

    // Trigger initial state
    const initialMethod = this.form.get('paymentMethod')!.value as PaymentMethod;
    const initialFree = FREE_PAYMENT_METHODS.includes(initialMethod);
    this.showJustification.set(initialFree);
    if (initialFree) {
      this.form.get('justification')!.setValidators([Validators.required]);
      this.form.get('justification')!.updateValueAndValidity({ emitEvent: false });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onMethodChange(): void {
    // valueChanges subscription handles this; this handler is for change detection clarity
  }

  formatEntryTime(): string {
    return this.session().entryAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue() as { paymentMethod: PaymentMethod; justification: string };
    this.submitted.emit({
      paymentMethod: raw.paymentMethod,
      justification: raw.justification ?? '',
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
