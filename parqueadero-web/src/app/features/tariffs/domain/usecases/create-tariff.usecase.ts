import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure, BusinessRuleFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { TariffRepository, CreateTariffParams } from '../repositories/tariff.repository';
import { TARIFF_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';

@Injectable()
export class CreateTariffUseCase extends UseCase<CreateTariffParams, TariffEntity> {
  constructor(@Inject(TARIFF_REPOSITORY_TOKEN) private readonly repo: TariffRepository) {
    super();
  }

  async execute(params: CreateTariffParams): Promise<Either<Failure, TariffEntity>> {
    if (!params.name?.trim() || params.name.trim().length < 3) {
      return left(new ValidationFailure('El nombre debe tener al menos 3 caracteres', 'name'));
    }
    if (params.name.trim().length > 100) {
      return left(new ValidationFailure('El nombre no puede superar 100 caracteres', 'name'));
    }
    if (!Number.isInteger(params.valueCents) || params.valueCents <= 0) {
      return left(new ValidationFailure('El valor debe ser un entero mayor a 0', 'valueCents'));
    }
    if (!Number.isInteger(params.graceMinutes) || params.graceMinutes < 0) {
      return left(new ValidationFailure('Los minutos de gracia deben ser ≥ 0', 'graceMinutes'));
    }
    if (!Number.isInteger(params.dailyCapCents) || params.dailyCapCents <= 0) {
      return left(new ValidationFailure('El tope diario debe ser un entero mayor a 0', 'dailyCapCents'));
    }
    const isMonthly = params.unit === 'mensualidad';

    // Tiered pricing (S4). Para parking, los 3 valores son obligatorios y
    // deben cumplir las constraints C4-C6 del backend (ver `tariffs-pricing.spec.md`).
    if (!isMonthly) {
      const { perMinuteCents, perHourCents, plenaCents } = params;
      if (!Number.isInteger(perMinuteCents) || (perMinuteCents as number) <= 0) {
        return left(new ValidationFailure('Valor por minuto debe ser entero > 0', 'perMinuteCents'));
      }
      if (!Number.isInteger(perHourCents) || (perHourCents as number) <= 0) {
        return left(new ValidationFailure('Valor por hora debe ser entero > 0', 'perHourCents'));
      }
      if (!Number.isInteger(plenaCents) || (plenaCents as number) <= 0) {
        return left(new ValidationFailure('Plena debe ser entero > 0', 'plenaCents'));
      }
      if ((perHourCents as number) > (perMinuteCents as number) * 60) {
        return left(new ValidationFailure('La hora no puede ser más cara que 60 min sueltos', 'perHourCents'));
      }
      if ((plenaCents as number) > (perHourCents as number) * 24) {
        return left(new ValidationFailure('La plena no puede superar 24 h de la tarifa hora', 'plenaCents'));
      }
    } else if (params.dailyCapCents <= params.valueCents) {
      // Mensualidad: el cap se sincroniza con el value; para parking no aplica
      // (lo reemplaza plena_cents).
      return left(new ValidationFailure('El tope diario debe ser mayor al valor por unidad', 'dailyCapCents'));
    }
    if (params.validFrom && params.validTo && params.validTo <= params.validFrom) {
      return left(new ValidationFailure('La fecha de fin debe ser posterior a la fecha de inicio', 'validTo'));
    }

    // Una sola tarifa activa por (tipo de vehículo, categoría parking|mensualidad).
    // Sin esta validación, el sistema tomaría "cualquiera" al cobrar.
    const sameCatResult = await this.repo.existsActiveSameCategory(params.vehicleType, isMonthly);
    if (sameCatResult.isLeft()) return sameCatResult as Either<Failure, never>;
    if (sameCatResult.fold(() => false, exists => exists)) {
      const cat = isMonthly ? 'mensualidad' : 'parking';
      return left(new BusinessRuleFailure(
        `Ya existe una tarifa activa de ${cat} para ${params.vehicleType}. ` +
        `Desactivá la actual antes de crear una nueva.`
      ));
    }

    const duplicateResult = await this.repo.existsActive(params.name.trim(), params.vehicleType);
    if (duplicateResult.isLeft()) return duplicateResult as Either<Failure, never>;
    if (duplicateResult.fold(() => false, exists => exists)) {
      return left(new BusinessRuleFailure(
        `Ya existe una tarifa activa con el nombre "${params.name.trim()}" para ese tipo de vehículo`
      ));
    }

    return this.repo.create({ ...params, name: params.name.trim() });
  }
}
