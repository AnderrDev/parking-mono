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

    // 4. Resolver método y monto.
    //
    // Si el método elegido es gratis (cortesía/error/mensual) o la sesión es
    // mensualidad activa, el cobro es 0 y NO necesitamos consultar tarifa.
    // Esto permite cerrar sesiones cuyo `vehicle_type` no tenga tarifa
    // configurada (ej: 'otro' sin tarifa específica) eligiendo un método
    // gratis con justificación.
    //
    // Si el método requiere cobro, sí buscamos tarifa y calculamos.
    const isMonthlyExit = session.isMonthly;
    const isFreeMethod = FREE_PAYMENT_METHODS.includes(params.paymentMethod);

    let effectiveMethod: PaymentMethod = params.paymentMethod;
    let amountCents = 0;

    if (isMonthlyExit) {
      // Mensualidad activa siempre fuerza method='mensual' y monto 0.
      effectiveMethod = 'mensual';
      amountCents = 0;
    } else if (isFreeMethod) {
      // Cortesía / error: no se cobra, no se necesita tarifa.
      amountCents = 0;
    } else {
      // Cobro real: se requiere tarifa configurada para el tipo de vehículo.
      const tariffResult = await this.repo.getActiveTariff(session.vehicleType);
      if (tariffResult.isLeft()) return tariffResult as Either<Failure, never>;
      const tariff: TariffEntity | null = tariffResult.fold(() => null, (t) => t);
      if (!tariff) return left(new ValidationFailure('No se encontró tarifa activa', 'tariff'));

      const feeEither = this.calculateFee.calculate({
        durationMinutes,
        tariff,
        isMonthly: false,
        vehicleType: session.vehicleType,
      });
      if (feeEither.isLeft()) return feeEither as Either<Failure, never>;
      const fee: CalculateParkingFeeResult | null = feeEither.fold(() => null, (f) => f);
      if (!fee) return left(new ValidationFailure('No se pudo calcular la tarifa', 'fee'));

      amountCents = fee.amountCents;
    }

    // 5. Validar justificación obligatoria para todo cierre sin cobro.
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

    // 6. Register exit
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
