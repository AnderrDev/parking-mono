import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import { VehicleType } from '../../domain/entities/parking-session.entity';
import { formatCOP } from '../../../../shared/utils/currency.utils';

export interface TariffBarItem {
  type: VehicleType;
  label: string;
  tariff: TariffEntity;
}

/**
 * Barra horizontal de "tarifas vigentes" mostrada al operador como
 * referencia. Calcula precio por hora y por minuto según `tariff.unit`.
 */
@Component({
  selector: 'app-tariffs-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  styleUrl: './tariffs-bar.component.scss',
  template: `
    @if (tariffs.length > 0) {
      <section class="tariffs-bar" aria-label="Tarifas vigentes">
        <span class="tariffs-bar__title">Tarifas vigentes</span>
        <ul class="tariffs-bar__list" role="list">
          @for (item of tariffs; track item.type) {
            <li class="tariff-chip">
              <span class="tariff-chip__type">{{ item.label }}</span>
              <span class="tariff-chip__rate mono">
                {{ formatCOP(perHourCents(item.tariff)) }}<span class="tariff-chip__unit">/h</span>
              </span>
              <span class="tariff-chip__sep" aria-hidden="true">·</span>
              <span class="tariff-chip__rate tariff-chip__rate--secondary mono">
                {{ formatCOP(perMinuteCents(item.tariff)) }}<span class="tariff-chip__unit">/min</span>
              </span>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class TariffsBarComponent {
  @Input({ required: true }) tariffs: TariffBarItem[] = [];

  protected readonly formatCOP = formatCOP;

  protected perHourCents(t: TariffEntity): number {
    switch (t.unit) {
      case 'hora':
      case 'fraccion':
        return t.valueCents;
      case 'minuto':
        return t.valueCents * 60;
      case 'dia':
        return Math.round(t.valueCents / 24);
      // Los planes prepagados no tienen equivalente por hora.
      case 'mensualidad':
      case 'quincena':
        return 0;
    }
  }

  protected perMinuteCents(t: TariffEntity): number {
    switch (t.unit) {
      case 'minuto':
        return t.valueCents;
      case 'hora':
      case 'fraccion':
        return Math.round(t.valueCents / 60);
      case 'dia':
        return Math.round(t.valueCents / 1440);
      case 'mensualidad':
      case 'quincena':
        return 0;
    }
  }
}
