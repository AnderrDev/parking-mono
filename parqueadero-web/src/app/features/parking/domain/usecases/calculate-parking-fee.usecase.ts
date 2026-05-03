import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { TariffEntity } from '../entities/tariff.entity';
import { VehicleType } from '../entities/parking-session.entity';
import { roundToCopStep } from '../../../../shared/utils/currency.utils';

export interface CalculateParkingFeeParams {
  durationMinutes: number;
  tariff: TariffEntity;
  isMonthly: boolean;
  vehicleType: VehicleType;
}

export type FeeReason = 'grace' | 'monthly' | 'paid';

export interface FeeBreakdown {
  base: number;
  grace: number;
  cap: number;
  durationMinutes: number;
  unit: string;
}

export interface CalculateParkingFeeResult {
  amountCents: number;
  reason: FeeReason;
  breakdown: FeeBreakdown;
}

@Injectable({ providedIn: 'root' })
export class CalculateParkingFeeUseCase extends UseCase<CalculateParkingFeeParams, CalculateParkingFeeResult> {
  execute(params: CalculateParkingFeeParams): Promise<Either<Failure, CalculateParkingFeeResult>> {
    return Promise.resolve(this.calculate(params));
  }

  // Synchronous variant for real-time preview in UI
  calculate(params: CalculateParkingFeeParams): Either<Failure, CalculateParkingFeeResult> {
    const { durationMinutes, tariff, isMonthly } = params;

    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      return left(new ValidationFailure('Duración debe ser un entero > 0', 'durationMinutes'));
    }
    if (tariff.dailyCapCents <= 0) {
      return left(new ValidationFailure('Tope diario de tarifa inválido', 'tariff'));
    }

    const validUnits = ['minuto', 'hora', 'fraccion', 'dia'];
    if (!validUnits.includes(tariff.unit)) {
      return left(new ValidationFailure(`Unidad de tarifa desconocida: ${tariff.unit}`, 'tariff'));
    }

    const duration = Math.max(1, durationMinutes);
    const baseBreakdown: FeeBreakdown = {
      base: 0,
      grace: tariff.graceMinutes,
      cap: tariff.dailyCapCents,
      durationMinutes: duration,
      unit: tariff.unit,
    };

    if (duration < tariff.graceMinutes) {
      return right({ amountCents: 0, reason: 'grace', breakdown: baseBreakdown });
    }

    if (isMonthly) {
      return right({ amountCents: 0, reason: 'monthly', breakdown: baseBreakdown });
    }

    let base: number;
    switch (tariff.unit) {
      case 'minuto':
        base = (duration * tariff.valueCents) / 60;
        break;
      case 'hora':
        // Proporcional por minuto: el operador configura el valor por hora
        // y se cobra exactamente los minutos transcurridos (sin redondear a hora completa).
        base = (duration * tariff.valueCents) / 60;
        break;
      case 'fraccion':
        base = Math.ceil(duration / 30) * tariff.valueCents;
        break;
      case 'dia':
        base = Math.ceil(duration / 1440) * tariff.valueCents;
        break;
      default:
        base = 0;
    }

    // Aplicar tope diario y redondear al múltiplo de $50 (mínimo físico
    // circulante en Colombia). Sin esto, el cálculo proporcional por
    // minuto produce montos como $166,67 que no se pueden cobrar ni dar
    // de vuelta con monedas reales.
    const capped = Math.min(base, tariff.dailyCapCents);
    const amountCents = roundToCopStep(capped);
    return right({
      amountCents,
      reason: 'paid',
      breakdown: { ...baseBreakdown, base },
    });
  }
}
