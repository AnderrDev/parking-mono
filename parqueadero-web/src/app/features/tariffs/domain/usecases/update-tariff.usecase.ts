import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure, BusinessRuleFailure, NotFoundFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { TariffRepository, UpdateTariffParams } from '../repositories/tariff.repository';
import { TARIFF_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';

export interface UpdateTariffUseCaseParams extends UpdateTariffParams {
  id: string;
}

@Injectable()
export class UpdateTariffUseCase extends UseCase<UpdateTariffUseCaseParams, TariffEntity> {
  constructor(@Inject(TARIFF_REPOSITORY_TOKEN) private readonly repo: TariffRepository) {
    super();
  }

  async execute(params: UpdateTariffUseCaseParams): Promise<Either<Failure, TariffEntity>> {
    const { id, ...fields } = params;

    if (fields.name !== undefined) {
      const name = fields.name.trim();
      if (name.length < 3) return left(new ValidationFailure('El nombre debe tener al menos 3 caracteres', 'name'));
      if (name.length > 100) return left(new ValidationFailure('El nombre no puede superar 100 caracteres', 'name'));
      fields.name = name;
    }
    if (fields.valueCents !== undefined && (!Number.isInteger(fields.valueCents) || fields.valueCents <= 0)) {
      return left(new ValidationFailure('El valor debe ser un entero mayor a 0', 'valueCents'));
    }
    if (fields.graceMinutes !== undefined && (!Number.isInteger(fields.graceMinutes) || fields.graceMinutes < 0)) {
      return left(new ValidationFailure('Los minutos de gracia deben ser ≥ 0', 'graceMinutes'));
    }
    if (fields.dailyCapCents !== undefined && (!Number.isInteger(fields.dailyCapCents) || fields.dailyCapCents <= 0)) {
      return left(new ValidationFailure('El tope diario debe ser un entero mayor a 0', 'dailyCapCents'));
    }
    if (fields.perMinuteCents !== undefined && fields.perMinuteCents !== null && (!Number.isInteger(fields.perMinuteCents) || fields.perMinuteCents <= 0)) {
      return left(new ValidationFailure('Valor por minuto debe ser entero > 0', 'perMinuteCents'));
    }
    if (fields.perHourCents !== undefined && fields.perHourCents !== null && (!Number.isInteger(fields.perHourCents) || fields.perHourCents <= 0)) {
      return left(new ValidationFailure('Valor por hora debe ser entero > 0', 'perHourCents'));
    }
    if (fields.plenaCents !== undefined && fields.plenaCents !== null && (!Number.isInteger(fields.plenaCents) || fields.plenaCents <= 0)) {
      return left(new ValidationFailure('Plena debe ser entero > 0', 'plenaCents'));
    }
    if (fields.validFrom && fields.validTo && fields.validTo <= fields.validFrom) {
      return left(new ValidationFailure('La fecha de fin debe ser posterior a la fecha de inicio', 'validTo'));
    }

    const existing = await this.repo.findById(id);
    if (existing.isLeft()) return existing as Either<Failure, never>;
    const tariff = existing.fold(() => null, t => t);
    if (!tariff) return left(new NotFoundFailure('Tarifa no encontrada'));

    if (fields.name && fields.name !== tariff.name) {
      const duplicateResult = await this.repo.existsActive(fields.name, tariff.vehicleType, id);
      if (duplicateResult.isLeft()) return duplicateResult as Either<Failure, never>;
      if (duplicateResult.fold(() => false, exists => exists)) {
        return left(new BusinessRuleFailure(
          `Ya existe una tarifa activa con el nombre "${fields.name}" para ese tipo de vehículo`
        ));
      }
    }

    const valueCents = fields.valueCents ?? tariff.valueCents;
    const dailyCapCents = fields.dailyCapCents ?? tariff.dailyCapCents;
    const isMonthly = tariff.unit === 'mensualidad';

    if (!isMonthly) {
      // Constraints cliente-friendly C5/C6 sobre el estado resultante:
      const perMinute = fields.perMinuteCents ?? tariff.perMinuteCents;
      const perHour   = fields.perHourCents   ?? tariff.perHourCents;
      const plena     = fields.plenaCents     ?? tariff.plenaCents;
      if (perMinute != null && perHour != null && perHour > perMinute * 60) {
        return left(new ValidationFailure('La hora no puede ser más cara que 60 min sueltos', 'perHourCents'));
      }
      if (perHour != null && plena != null && plena > perHour * 24) {
        return left(new ValidationFailure('La plena no puede superar 24 h de la tarifa hora', 'plenaCents'));
      }
    } else if (dailyCapCents <= valueCents) {
      return left(new ValidationFailure('El tope diario debe ser mayor al valor por unidad', 'dailyCapCents'));
    }

    // Si reactivamos una tarifa que estaba inactiva, asegurar que no
    // colisione con otra activa de la misma categoría (parking|mensualidad).
    if (fields.isActive === true && !tariff.isActive) {
      const sameCatResult = await this.repo.existsActiveSameCategory(tariff.vehicleType, isMonthly, id);
      if (sameCatResult.isLeft()) return sameCatResult as Either<Failure, never>;
      if (sameCatResult.fold(() => false, exists => exists)) {
        const cat = isMonthly ? 'mensualidad' : 'parking';
        return left(new BusinessRuleFailure(
          `Ya existe una tarifa activa de ${cat} para ${tariff.vehicleType}. ` +
          `Desactivá la actual antes de reactivar esta.`
        ));
      }
    }

    return this.repo.update(id, fields);
  }
}
