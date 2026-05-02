import {
  Directive,
  ElementRef,
  Renderer2,
  forwardRef,
  inject,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const PESOS_FORMATTER = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Input monetario en pesos colombianos. El FormControl mantiene el valor en
 * centavos (convención del proyecto: `*_cents`); el usuario ve y digita pesos
 * con separador de miles (ej. 5.000 = 500000 cents).
 *
 * Usage:
 *   <input type="text" appCurrencyInput formControlName="amountCents" />
 */
@Directive({
  selector: 'input[appCurrencyInput]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CurrencyInputDirective),
      multi: true,
    },
  ],
  host: {
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    '(input)': 'onInput($event)',
    '(blur)': 'onBlur()',
  },
})
export class CurrencyInputDirective implements ControlValueAccessor {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);

  private onChangeFn: (value: number | null) => void = () => {};
  private onTouchedFn: () => void = () => {};

  writeValue(cents: number | null | undefined): void {
    const display =
      cents == null || Number.isNaN(cents)
        ? ''
        : PESOS_FORMATTER.format(Math.round(cents / 100));
    this.renderer.setProperty(this.el.nativeElement, 'value', display);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChangeFn = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouchedFn = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.renderer.setProperty(this.el.nativeElement, 'disabled', isDisabled);
  }

  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '');

    if (!digits) {
      this.renderer.setProperty(input, 'value', '');
      this.onChangeFn(null);
      return;
    }

    const pesos = parseInt(digits, 10);
    const formatted = PESOS_FORMATTER.format(pesos);
    this.renderer.setProperty(input, 'value', formatted);
    this.onChangeFn(pesos * 100);
  }

  protected onBlur(): void {
    this.onTouchedFn();
  }
}
