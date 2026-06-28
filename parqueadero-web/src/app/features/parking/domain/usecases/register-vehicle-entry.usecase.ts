import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import {
  Failure,
  BusinessRuleFailure,
  ValidationFailure,
} from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PARKING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { normalizePlate, isValidPlate } from '../../../../shared/utils/plate.utils';
import { ParkingRepository, RegisterEntryParams } from '../repositories/parking.repository';
import { ParkingSessionEntity, VehicleType } from '../entities/parking-session.entity';

export interface RegisterVehicleEntryParams {
  plate: string;
  vehicleType: VehicleType;
  color: string | null;
  brand: string | null;
  userId: string;
}

export interface RegisterVehicleEntryResult {
  session: ParkingSessionEntity;
  monthlyPlanWarning: string | null;
}

@Injectable()
export class RegisterVehicleEntryUseCase extends UseCase<
  RegisterVehicleEntryParams,
  RegisterVehicleEntryResult
> {
  constructor(
    @Inject(PARKING_REPOSITORY_TOKEN) private readonly repo: ParkingRepository,
  ) {
    super();
  }

  async execute(
    params: RegisterVehicleEntryParams,
  ): Promise<Either<Failure, RegisterVehicleEntryResult>> {
    // 1. Validate and normalize plate
    if (!params.plate || params.plate.trim() === '') {
      return left(new ValidationFailure('La placa es obligatoria', 'plate'));
    }

    if (!isValidPlate(params.plate)) {
      return left(
        new ValidationFailure(
          `La placa ${params.plate} no cumple el formato colombiano esperado (ABC123 o ABC12D).`,
          'plate',
        ),
      );
    }
    const normalized = normalizePlate(params.plate);

    // 2. Validate vehicle type
    const validTypes: VehicleType[] = ['carro', 'moto', 'bicicleta', 'otro'];
    if (!validTypes.includes(params.vehicleType)) {
      return left(new ValidationFailure('Tipo de vehículo inválido', 'vehicleType'));
    }

    // 3. Check for open cashier shift
    const shiftResult = await this.repo.getOpenCashierShiftId(params.userId);
    if (shiftResult.isLeft()) return shiftResult as Either<Failure, never>;

    const cashierShiftId = shiftResult.getOrElse(null);
    if (cashierShiftId === null) {
      return left(
        new BusinessRuleFailure(
          'No hay un turno de caja abierto. Abre un turno antes de registrar entradas.',
        ),
      );
    }

    // 4. Check for duplicate active session
    const existingResult = await this.repo.getActiveSessionByPlate(normalized);
    if (existingResult.isLeft()) return existingResult as Either<Failure, never>;

    if (existingResult.getOrElse(null) !== null) {
      return left(
        new BusinessRuleFailure(
          `El vehículo ${normalized} ya tiene una sesión activa. Cierre la sesión anterior para registrar una nueva entrada.`,
        ),
      );
    }

    // 5. Check for active monthly plan
    const planResult = await this.repo.getActivePlanByPlate(normalized);
    if (planResult.isLeft()) return planResult as Either<Failure, never>;

    const plan = planResult.getOrElse(null);
    let monthlyPlanId: string | null = null;
    let monthlyPlanWarning: string | null = null;

    if (plan !== null) {
      if (plan.isCurrentlyActive) {
        monthlyPlanId = plan.id;
        if (plan.status === 'expiring') {
          const days = plan.daysUntilExpiry;
          monthlyPlanWarning = `Mensualidad próxima a vencer el ${plan.endDate.toLocaleDateString('es-CO')} (en ${days} día${days !== 1 ? 's' : ''}).`;
        }
      } else {
        monthlyPlanWarning = `La mensualidad del vehículo ${normalized} está vencida. Se registra como rotación.`;
      }
    }

    // 6. Register entry
    const entryParams: RegisterEntryParams = {
      plate: normalized,
      vehicleType: params.vehicleType,
      color: params.color,
      brand: params.brand,
      userId: params.userId,
      cashierShiftId,
      monthlyPlanId,
    };

    const sessionResult = await this.repo.registerEntry(entryParams);
    if (sessionResult.isLeft()) return sessionResult as Either<Failure, never>;

    return sessionResult.map((session) => ({ session, monthlyPlanWarning }));
  }
}
