import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left } from '../../../../core/either/either';
import { Failure, NotFoundFailure, ValidationFailure } from '../../../../core/either/failures';
import {
  CASHIER_REPOSITORY_TOKEN,
  PAYMENT_REPOSITORY_TOKEN,
  GET_SETTING_TOKEN,
} from '../../../../core/di/injection-tokens';
import { CashierShiftEntity } from '../entities/cashier-shift.entity';
import { CashierRepository } from '../repositories/cashier.repository';
import { PaymentRepository } from '../../../payments/domain/repositories/payment.repository';
import { GetSettingUseCase } from '../../../settings/domain/usecases/get-setting.usecase';
import { OperationalConfigValue } from '../../../settings/domain/entities/app-setting.entity';

export interface CloseShiftParams {
  shiftId: string;
  userId: string;
  closingBalanceCents: number;
  justification: string | null;
}

const DEFAULT_DIFF_THRESHOLD_CENTS = 500_000;

@Injectable()
export class CloseShiftUseCase extends UseCase<CloseShiftParams, CashierShiftEntity> {
  constructor(
    @Inject(CASHIER_REPOSITORY_TOKEN) private readonly cashierRepo: CashierRepository,
    @Inject(PAYMENT_REPOSITORY_TOKEN) private readonly paymentRepo: PaymentRepository,
    @Inject(GET_SETTING_TOKEN) private readonly getSetting: GetSettingUseCase,
  ) {
    super();
  }

  async execute(params: CloseShiftParams): Promise<Either<Failure, CashierShiftEntity>> {
    if (params.closingBalanceCents < 0) {
      return left(new ValidationFailure('El saldo contado no puede ser negativo'));
    }

    const shiftResult = await this.cashierRepo.findById(params.shiftId);
    if (shiftResult.isLeft()) return left(shiftResult.value);
    const shift = shiftResult.value;
    if (!shift || shift.status !== 'open') {
      return left(new NotFoundFailure('Turno no encontrado o ya cerrado', 'cashier_shift'));
    }

    const cashSumResult = await this.paymentRepo.sumCashByShift(params.shiftId);
    if (cashSumResult.isLeft()) return left(cashSumResult.value);
    const cashSum = cashSumResult.value as number;

    // Los retiros parciales (HU-039) sacan efectivo de la caja durante el
    // turno, por lo que reducen el efectivo esperado al cierre. Mantener
    // simetría con `ReconcileShiftUseCase` (UI), que ya descuenta los
    // retiros del cashExpected mostrado al cajero.
    const withdrawalsResult = await this.cashierRepo.listWithdrawalsByShift(params.shiftId);
    if (withdrawalsResult.isLeft()) return left(withdrawalsResult.value);
    const withdrawalsTotal = withdrawalsResult.value.reduce(
      (acc, w) => acc + w.amountCents,
      0,
    );

    const expected = shift.openingBalanceCents + cashSum - withdrawalsTotal;
    const difference = params.closingBalanceCents - expected;

    const threshold = await this.loadDiffThreshold();
    if (Math.abs(difference) > threshold) {
      const j = params.justification?.trim() ?? '';
      if (!j) {
        const thresholdStr = (threshold / 100).toLocaleString('es-CO', {
          style: 'currency', currency: 'COP', minimumFractionDigits: 0,
        });
        return left(new ValidationFailure(
          `La diferencia supera ${thresholdStr}. Ingresa una justificación.`,
        ));
      }
    }

    return this.cashierRepo.close({
      shiftId: params.shiftId,
      closingBalanceCents: params.closingBalanceCents,
      expectedBalanceCents: expected,
      differenceCents: difference,
      justification: params.justification ?? null,
    });
  }

  private async loadDiffThreshold(): Promise<number> {
    const r = await this.getSetting.execute({ key: 'operational_config' });
    if (r.isLeft() || !r.value) return DEFAULT_DIFF_THRESHOLD_CENTS;
    const v = (r.value.value as OperationalConfigValue).diff_threshold_cents;
    return typeof v === 'number' && v > 0 ? v : DEFAULT_DIFF_THRESHOLD_CENTS;
  }
}
