import {
  ChangeDetectionStrategy, Component, forwardRef, input, signal
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { normalizePlate, formatPlate, isValidPlate } from '../../utils/plate.utils';

@Component({
  selector: 'app-plate-input',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => PlateInputComponent),
    multi: true,
  }],
  template: `
    <div class="plate-input">
      <label class="plate-input__label" [attr.for]="inputId()">
        {{ label() }}
        @if (required()) { <span aria-hidden="true">*</span> }
      </label>

      <input
        class="plate-input__field"
        [class.plate-input__field--valid]="isValid()"
        [class.plate-input__field--invalid]="isTouched() && !isValid() && value().length > 0"
        type="text"
        [id]="inputId()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [attr.aria-invalid]="isTouched() && !isValid() && value().length > 0 ? 'true' : null"
        [attr.aria-describedby]="'hint-' + inputId()"
        [value]="displayValue()"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        maxlength="8"
        (input)="onInput($event)"
        (blur)="onBlur()"
      />

      <p class="plate-input__hint" [id]="'hint-' + inputId()">
        @if (isTouched() && value().length > 0 && !isValid()) {
          La placa no es válida. Ejemplo: ABC123
        } @else {
          Formato: ABC123 (carro) o ABC12D (moto)
        }
      </p>
    </div>
  `,
  styles: [`
    .plate-input {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .plate-input__label {
      font-size: var(--text-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text);
    }

    .plate-input__field {
      font-family: var(--font-mono);
      font-size: var(--text-xl);
      font-weight: var(--font-weight-medium);
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: var(--space-4);
      height: var(--touch-target-primary);
      border: 2px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text);
      width: 100%;
      transition: border-color var(--motion-fast) var(--ease-out);

      &::placeholder {
        color: var(--color-text-disabled);
        font-weight: var(--font-weight-regular);
      }

      &:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px var(--color-primary-soft);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .plate-input__field--valid {
      border-color: var(--color-success);
    }

    .plate-input__field--invalid {
      border-color: var(--color-danger);

      &:focus {
        border-color: var(--color-danger);
        box-shadow: 0 0 0 3px var(--color-danger-soft);
      }
    }

    .plate-input__hint {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      line-height: var(--line-height-snug);
    }
  `],
})
export class PlateInputComponent implements ControlValueAccessor {
  label       = input('Placa');
  placeholder = input('ABC123');
  inputId     = input('plate-input');
  required    = input(false);

  protected readonly value     = signal('');
  protected readonly isTouched = signal(false);
  protected readonly disabled  = signal(false);

  protected isValid(): boolean {
    return isValidPlate(this.value());
  }

  protected displayValue(): string {
    const v = this.value();
    return v.length >= 3 ? formatPlate(v) : v;
  }

  protected onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const normalized = normalizePlate(raw);
    this.value.set(normalized);
    this.onChange(normalized);
  }

  protected onBlur(): void {
    this.isTouched.set(true);
    this.onTouched();
  }

  // ControlValueAccessor
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onChange: (v: string) => void = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onTouched: () => void = () => {};

  writeValue(value: string): void {
    this.value.set(value ? normalizePlate(value) : '');
  }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); }
}
