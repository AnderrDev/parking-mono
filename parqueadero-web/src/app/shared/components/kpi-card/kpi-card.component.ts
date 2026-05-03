import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type KpiVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';

export interface KpiDelta {
  /** Cambio porcentual; null para "sin previo". */
  pct: number | null;
  /** El previo era 0 → mostramos "Nuevo" en lugar de % infinito. */
  isNew: boolean;
  /** Cambio absoluto en la unidad nativa (cents si es plata). */
  abs?: number;
  /** True si "más es mejor" (verde si ▲); false invertido. */
  higherIsBetter?: boolean;
  /** Sufijo opcional al delta (ej: monto absoluto formateado). */
  suffix?: string;
}

/**
 * Tarjeta KPI reutilizable. Renderiza el markup canónico del proyecto
 * usando las clases globales `.kpi`, `.kpi__label`, etc. de
 * `shared/styles/_data-viz.scss`. Soporta tooltip (`?` con title), variant
 * (border-left coloreado) y delta vs período anterior.
 */
@Component({
  selector: 'app-kpi-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <article class="kpi" [attr.data-variant]="variant" [attr.aria-label]="ariaLabel || label">
      <span class="kpi__label">
        {{ label }}
        @if (hint) {
          <span class="kpi__hint" [title]="hint">?</span>
        }
      </span>
      <strong class="kpi__value" [class.kpi__value--text]="textValue">{{ value }}</strong>
      @if (detail) {
        <span class="kpi__detail" [class.kpi__detail--warn]="detailWarn">{{ detail }}</span>
      }
      @if (delta) {
        <span class="kpi__delta" [class.kpi__delta--good]="deltaIsGood()" [class.kpi__delta--bad]="!deltaIsGood()">
          @if (delta.isNew) {
            Nuevo período
          } @else if (delta.pct !== null) {
            {{ delta.pct >= 0 ? '▲' : '▼' }}
            {{ delta.pct >= 0 ? '+' : '' }}{{ delta.pct }}%@if (delta.suffix) { ({{ delta.suffix }}) }
          }
        </span>
      }
    </article>
  `,
})
export class KpiCardComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string | number;
  @Input() detail?: string | null;
  @Input() detailWarn = false;
  @Input() variant: KpiVariant = 'default';
  @Input() hint?: string;
  /** True si `value` es un texto (capitalizado, font-size menor) en lugar de un número. */
  @Input() textValue = false;
  @Input() delta?: KpiDelta | null;
  /** ARIA label custom; si se omite, se usa `label`. */
  @Input() ariaLabel?: string;

  protected deltaIsGood(): boolean {
    if (!this.delta) return false;
    const higherIsBetter = this.delta.higherIsBetter ?? true;
    if (this.delta.isNew) return higherIsBetter;
    if (this.delta.pct === null) return false;
    return higherIsBetter ? this.delta.pct >= 0 : this.delta.pct <= 0;
  }
}
