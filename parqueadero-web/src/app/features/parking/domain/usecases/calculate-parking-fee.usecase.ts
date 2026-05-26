import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { TariffEntity } from '../entities/tariff.entity';
import { VehicleType } from '../entities/parking-session.entity';

export interface CalculateParkingFeeParams {
  durationMinutes: number;
  tariff: TariffEntity;
  isMonthly: boolean;
  vehicleType: VehicleType;
}

export type FeeReason = 'monthly' | 'paid';

export interface FeeBreakdown {
  hoursCompleted: number;
  remainderMinutes: number;
  perMinuteCents: number;
  perHourCents: number;
  hoursSubtotalCents: number;
  minutesSubtotalCents: number;
  subtotalCents: number;
  plenaCents: number;
  cappedByPlena: boolean;
  durationMinutes: number;
}

export interface CalculateParkingFeeResult {
  amountCents: number;
  reason: FeeReason;
  breakdown: FeeBreakdown;
}

/**
 * Cobro aditivo con tope diario:
 *   horas = floor(duration / 60)
 *   resto = duration % 60
 *   subtotal = horas × per_hour + resto × per_minute
 *   amount = MIN(subtotal, plena)
 *
 * Mensualidad → $0. La gracia se eliminó del producto (2026-05-24).
 * Spec: `parqueadero-backend/specs/tariffs-pricing.spec.md`.
 */
@Injectable({ providedIn: 'root' })
export class CalculateParkingFeeUseCase extends UseCase<CalculateParkingFeeParams, CalculateParkingFeeResult> {
  execute(params: CalculateParkingFeeParams): Promise<Either<Failure, CalculateParkingFeeResult>> {
    return Promise.resolve(this.calculate(params));
  }

  calculate(params: CalculateParkingFeeParams): Either<Failure, CalculateParkingFeeResult> {
    const { durationMinutes, tariff, isMonthly } = params;

    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      return left(new ValidationFailure('Duración debe ser un entero > 0', 'durationMinutes'));
    }

    const perMinute = tariff.perMinuteCents;
    const perHour   = tariff.perHourCents;
    const plena     = tariff.plenaCents;
    if (perMinute == null || perHour == null || plena == null) {
      return left(new ValidationFailure(
        'Tarifa incompleta: faltan per_minute_cents/per_hour_cents/plena_cents. ' +
        'Editá la tarifa desde /tariffs para setear los 3 valores.',
        'tariff',
      ));
    }
    if (perMinute <= 0 || perHour <= 0 || plena <= 0) {
      return left(new ValidationFailure('Tarifa con valores inválidos', 'tariff'));
    }

    const duration = durationMinutes;
    const hoursCompleted   = Math.floor(duration / 60);
    const remainderMinutes = duration % 60;
    const hoursSubtotal    = hoursCompleted   * perHour;
    const minutesSubtotal  = remainderMinutes * perMinute;
    const subtotal         = hoursSubtotal + minutesSubtotal;
    const cappedByPlena    = subtotal > plena;
    const amount           = cappedByPlena ? plena : subtotal;

    const breakdown: FeeBreakdown = {
      hoursCompleted,
      remainderMinutes,
      perMinuteCents: perMinute,
      perHourCents: perHour,
      hoursSubtotalCents: hoursSubtotal,
      minutesSubtotalCents: minutesSubtotal,
      subtotalCents: subtotal,
      plenaCents: plena,
      cappedByPlena,
      durationMinutes: duration,
    };

    if (isMonthly) {
      return right({ amountCents: 0, reason: 'monthly', breakdown });
    }

    return right({ amountCents: amount, reason: 'paid', breakdown });
  }
}
