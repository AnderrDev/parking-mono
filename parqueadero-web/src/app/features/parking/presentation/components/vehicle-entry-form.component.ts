import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  OnInit,
} from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { getErrorMessage } from '../../../../shared/forms/form-error-messages';
import { ParkingForms } from '../forms/parking.forms';
import { VehicleType } from '../../domain/entities/parking-session.entity';

export interface VehicleEntryFormValue {
  plate: string;
  vehicleType: VehicleType;
  color: string | null;
  brand: string | null;
}

@Component({
  selector: 'app-vehicle-entry-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, LoadingSpinnerComponent],
  template: `
    <form
      class="entry-form"
      [formGroup]="form"
      (ngSubmit)="onSubmit()"
      novalidate
    >
      @if (monthlyPlanWarning()) {
        <div class="entry-form__plan-badge" role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {{ monthlyPlanWarning() }}
        </div>
      }

      <div class="entry-form__fields">
        <div class="field">
          <label class="field__label" for="plate">Placa</label>
          <input
            id="plate"
            class="field__input field__input--mono"
            [class.field__input--error]="showError('plate')"
            type="text"
            formControlName="plate"
            placeholder="ABC123"
            autocomplete="off"
            inputmode="text"
            maxlength="7"
            [attr.aria-describedby]="showError('plate') ? 'plate-error' : null"
            [attr.aria-invalid]="showError('plate') ? 'true' : null"
          />
          @if (showError('plate')) {
            <span id="plate-error" class="field__error" role="alert">
              {{ getFieldError('plate') }}
            </span>
          }
        </div>

        <div class="field">
          <label class="field__label" for="vehicleType">Tipo de vehículo</label>
          <select
            id="vehicleType"
            class="field__select"
            [class.field__input--error]="showError('vehicleType')"
            formControlName="vehicleType"
            [attr.aria-describedby]="showError('vehicleType') ? 'vehicleType-error' : null"
          >
            <option value="carro">Carro</option>
            <option value="moto">Moto</option>
            <option value="bicicleta">Bicicleta</option>
            <option value="otro">Otro</option>
          </select>
          @if (showError('vehicleType')) {
            <span id="vehicleType-error" class="field__error" role="alert">
              {{ getFieldError('vehicleType') }}
            </span>
          }
        </div>

        <div class="field">
          <label class="field__label" for="color">Color <span class="field__optional">(opcional)</span></label>
          <input
            id="color"
            class="field__input"
            type="text"
            formControlName="color"
            placeholder="Ej: blanco"
            autocomplete="off"
            maxlength="50"
          />
        </div>

        <div class="field">
          <label class="field__label" for="brand">Marca <span class="field__optional">(opcional)</span></label>
          <input
            id="brand"
            class="field__input"
            type="text"
            formControlName="brand"
            placeholder="Ej: Toyota"
            autocomplete="off"
            maxlength="50"
          />
        </div>
      </div>

      <button
        class="entry-form__submit"
        type="submit"
        [disabled]="loading()"
      >
        @if (loading()) {
          <app-loading-spinner label="Registrando entrada..." />
        } @else {
          Registrar entrada
        }
      </button>
    </form>
  `,
  styles: [`
    .entry-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }

    .entry-form__plan-badge {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      background: color-mix(in srgb, var(--color-monthly) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--color-monthly) 40%, transparent);
      border-radius: var(--radius-md);
      color: var(--color-monthly);
      font-size: var(--text-sm);
      font-weight: var(--font-weight-medium);

      svg { flex-shrink: 0; }
    }

    .entry-form__fields {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-4);

      @media (max-width: 480px) {
        grid-template-columns: 1fr;
      }
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .field__label {
      font-size: var(--text-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-primary);
    }

    .field__optional {
      font-weight: var(--font-weight-normal);
      color: var(--color-text-secondary);
    }

    .field__input {
      padding: var(--space-2) var(--space-3);
      font-size: var(--text-base);
      font-family: var(--font-sans);
      color: var(--color-text-primary);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      min-height: var(--touch-target-min);
      box-sizing: border-box;
      width: 100%;
      transition: border-color var(--motion-duration-fast) var(--motion-easing-standard);

      &::placeholder { color: var(--color-text-placeholder); }
      &:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
      }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    .field__input--mono {
      font-family: var(--font-mono);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .field__input--error {
      border-color: var(--color-danger);
      &:focus {
        border-color: var(--color-danger);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-danger) 20%, transparent);
      }
    }

    .field__select {
      padding: var(--space-2) var(--space-3);
      font-size: var(--text-base);
      font-family: var(--font-sans);
      color: var(--color-text-primary);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      min-height: var(--touch-target-min);
      width: 100%;
      cursor: pointer;
      appearance: auto;

      &:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
      }
    }

    .field__error {
      font-size: var(--text-xs);
      color: var(--color-danger);
    }

    .entry-form__submit {
      width: 100%;
      min-height: var(--touch-target-min);
      padding: var(--space-3);
      background: var(--color-primary);
      color: #fff;
      font-size: var(--text-base);
      font-weight: var(--font-weight-semibold);
      font-family: var(--font-sans);
      border-radius: var(--radius-md);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      transition: background var(--motion-duration-fast) var(--motion-easing-standard);

      &:hover:not(:disabled) { background: var(--color-primary-hover); }
      &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
      &:disabled { opacity: 0.7; cursor: not-allowed; }
    }
  `],
})
export class VehicleEntryFormComponent implements OnInit {
  loading = input(false);
  monthlyPlanWarning = input<string | null>(null);
  submitted = output<VehicleEntryFormValue>();

  form!: FormGroup;

  constructor(private readonly parkingForms: ParkingForms) {}

  ngOnInit(): void {
    this.form = this.parkingForms.createEntryForm();
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const raw = this.form.value as { plate: string; vehicleType: string; color: string; brand: string };
    this.submitted.emit({
      plate: raw.plate,
      vehicleType: raw.vehicleType as VehicleType,
      color: raw.color || null,
      brand: raw.brand || null,
    });
  }

  showError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }

  getFieldError(field: string): string {
    return getErrorMessage(this.form.get(field)?.errors ?? null);
  }

  resetForm(): void {
    this.form.reset({ vehicleType: 'carro' });
  }
}
