import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import {
  Failure,
  ValidationFailure,
  BusinessRuleFailure,
  NotFoundFailure,
} from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PARKING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import {
  ParkingRepository,
  RegisterExitParams,
  RegisterExitResult,
} from '../repositories/parking.repository';
import { PaymentMethod, FREE_PAYMENT_METHODS } from '../entities/payment.entity';
import { TariffEntity } from '../entities/tariff.entity';
import { CalculateParkingFeeUseCase, CalculateParkingFeeResult } from './calculate-parking-fee.usecase';

export interface RegisterVehicleExitParams {
  plate: string;
  exitAt?: Date;
  paymentMethod: PaymentMethod;
  justificationIfFree?: string | undefined;
  userId: string;
}

@Injectable()
export class RegisterVehicleExitUseCase extends UseCase<RegisterVehicleExitParams, RegisterExitResult> {
  constructor(
    @Inject(PARKING_REPOSITORY_TOKEN) private readonly repo: ParkingRepository,
    private readonly calculateFee: CalculateParkingFeeUseCase,
  ) {
    super();
  }

  async execute(params: RegisterVehicleExitParams): Promise<Either<Failure, RegisterExitResult>> {
    const plate = params.plate?.trim().toUpperCase() ?? '';
    if (!plate) {
      return left(new ValidationFailure('La placa es obligatoria', 'plate'));
    }

    // 1. Check open cashier shift
    const shiftResult = await this.repo.getOpenCashierShiftId(params.userId);
    if (shiftResult.isLeft()) return shiftResult as Either<Failure, never>;

    const cashierShiftId = shiftResult.getOrElse(null);
    if (cashierShiftId === null) {
      return left(
        new BusinessRuleFailure('No hay caja abierta. No se puede registrar salida.'),
      );
    }

    // 2. Find active session
    const sessionResult = await this.repo.getActiveSessionByPlate(plate);
    if (sessionResult.isLeft()) return sessionResult as Either<Failure, never>;

    const session = sessionResult.getOrElse(null);
    if (session === null) {
      return left(
        new NotFoundFailure(`No existe sesión activa para la placa ${plate}`, 'parking_session'),
      );
    }

    // 3. Determine exit time and duration
    const exitAt = params.exitAt ?? new Date();
    const durationMinutes = Math.max(1, Math.ceil((exitAt.getTime() - session.entryAt.getTime()) / 60_000));

    // 4. Get active tariff
    const tariffResult = await this.repo.getActiveTariff(session.vehicleType);
    if (tariffResult.isLeft()) return tariffResult as Either<Failure, never>;
    const tariff: TariffEntity | null = tariffResult.fold(() => null, (t) => t);
    if (!tariff) return left(new ValidationFailure('No se encontró tarifa activa', 'tariff'));

    // 5. Calculate fee
    const feeEither = this.calculateFee.calculate({
      durationMinutes,
      tariff,
      isMonthly: session.isMonthly,
      vehicleType: session.vehicleType,
    });
    if (feeEither.isLeft()) return feeEither as Either<Failure, never>;
    const fee: CalculateParkingFeeResult | null = feeEither.fold(() => null, (f) => f);
    if (!fee) return left(new ValidationFailure('No se pudo calcular la tarifa', 'fee'));

    // Auto-set method for monthly plan sessions
    const effectiveMethod: PaymentMethod =
      fee.reason === 'monthly' ? 'mensual' : params.paymentMethod;
    const amountCents = FREE_PAYMENT_METHODS.includes(effectiveMethod) ? 0 : fee.amountCents;

    // 6. Validate justification for free methods
    if (FREE_PAYMENT_METHODS.includes(effectiveMethod)) {
      if (!params.justificationIfFree?.trim()) {
        return left(
          new ValidationFailure(
            'Cuando la salida es sin pago, la justificación es obligatoria',
            'justificationIfFree',
          ),
        );
      }
    }

    // 7. Register exit
    const exitParams: RegisterExitParams = {
      sessionId: session.id,
      plate,
      exitAt,
      amountCents,
      paymentMethod: effectiveMethod,
      justification: params.justificationIfFree?.trim() ?? null,
      cashierShiftId,
      userId: params.userId,
    };

    return this.repo.registerExit(exitParams);
  }
}
