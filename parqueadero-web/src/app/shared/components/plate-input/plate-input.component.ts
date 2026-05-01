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
  templateUrl: './plate-input.component.html',
  styleUrl: './plate-input.component.scss',
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
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string): void {
    this.value.set(value ? normalizePlate(value) : '');
  }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); }
}
