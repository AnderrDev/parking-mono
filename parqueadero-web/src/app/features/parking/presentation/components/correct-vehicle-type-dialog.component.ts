import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { VehicleType } from '../../domain/entities/parking-session.entity';

export interface CorrectVehicleTypeDialogData {
  plate: string;
  currentType: VehicleType;
  availableTypes: VehicleType[];
}

export interface CorrectVehicleTypeDialogResult {
  vehicleType: VehicleType;
}

const LABELS: Record<VehicleType, string> = {
  carro: 'Carro',
  moto: 'Moto',
  bicicleta: 'Bicicleta',
  otro: 'Otro',
};

@Component({
  selector: 'app-correct-vehicle-type-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="dialog" role="document">
      <header class="dialog__header">
        <h2 id="correct-type-title" class="dialog__title">Corregir tipo</h2>
        <button type="button" class="dialog__close" (click)="cancel()" aria-label="Cerrar">×</button>
      </header>

      <p class="dialog__intro">
        Selecciona el tipo correcto para <strong>{{ data.plate }}</strong>.
      </p>

      <div class="type-grid" role="radiogroup" aria-labelledby="correct-type-title">
        @for (type of data.availableTypes; track type) {
          <label class="type-option" [class.type-option--active]="typeControl.value === type">
            <input type="radio" [formControl]="typeControl" [value]="type" />
            <span>{{ label(type) }}</span>
          </label>
        }
      </div>

      <div class="dialog__actions">
        <button type="button" class="btn btn--secondary" (click)="cancel()">Cancelar</button>
        <button
          type="button"
          class="btn btn--primary"
          [disabled]="!typeControl.value || typeControl.value === data.currentType"
          (click)="save()"
        >
          Guardar corrección
        </button>
      </div>
    </div>
  `,
  styles: [`
    .dialog {
      width: min(440px, calc(100vw - 32px));
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-5);
      background: var(--color-surface);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-3);
    }
    .dialog__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .dialog__title {
      margin: 0;
      color: var(--color-text-strong);
      font-size: var(--text-lg);
      font-weight: var(--font-weight-semibold);
    }
    .dialog__close {
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      font-size: var(--text-xl);
    }
    .dialog__close:hover { background: var(--color-bg-subtle); color: var(--color-text); }
    .dialog__intro {
      margin: 0;
      color: var(--color-text);
      font-size: var(--text-sm);
    }
    .type-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2);
    }
    .type-option {
      min-height: 48px;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      color: var(--color-text);
      cursor: pointer;
    }
    .type-option--active {
      border-color: var(--color-accent);
      background: var(--color-accent-soft);
      color: var(--color-text-strong);
      font-weight: var(--font-weight-semibold);
    }
    .dialog__actions {
      display: flex;
      gap: var(--space-2);
    }
    .btn {
      flex: 1;
      min-height: 48px;
      border-radius: var(--radius-md);
      border: 0;
      padding: 0 var(--space-4);
      font-size: var(--text-md);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn--secondary {
      border: 1px solid var(--color-border-strong);
      background: var(--color-surface);
      color: var(--color-text);
    }
    .btn--primary {
      background: var(--color-accent);
      color: var(--color-on-accent);
    }
  `],
})
export class CorrectVehicleTypeDialogComponent {
  readonly data = inject<CorrectVehicleTypeDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<
    DialogRef<CorrectVehicleTypeDialogResult | undefined, CorrectVehicleTypeDialogComponent>
  >(DialogRef);

  readonly typeControl = new FormControl<VehicleType>(this.data.currentType, { nonNullable: true });

  label(type: VehicleType): string {
    return LABELS[type];
  }

  save(): void {
    this.dialogRef.close({ vehicleType: this.typeControl.value });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
