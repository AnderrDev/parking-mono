import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left } from '../../../../core/either/either';
import { Failure, NotFoundFailure, ValidationFailure } from '../../../../core/either/failures';
import { CASHIER_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { CashierShiftEntity } from '../entities/cashier-shift.entity';
import { CashierRepository } from '../repositories/cashier.repository';
import { PaymentRepository } from '../../../payments/domain/repositories/payment.repository';

export interface CloseShiftParams {
  shiftId: string;
  userId: string;
  closingBalanceCents: number;
  justification: string | null;
}

const DIFF_THRESHOLD_CENTS = 500_000;

@Injectable()
export class CloseShiftUseCase extends UseCase<CloseShiftParams, CashierShiftEntity> {
  constructor(
    @Inject(CASHIER_REPOSITORY_TOKEN) private readonly cashierRepo: CashierRepository,
    @Inject(PAYMENT_REPOSITORY_TOKEN) private readonly paymentRepo: PaymentRepository,
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

    if (Math.abs(difference) > DIFF_THRESHOLD_CENTS) {
      const j = params.justification?.trim() ?? '';
      if (!j) {
        return left(new ValidationFailure('La diferencia supera $5.000. Ingresa una justificación.'));
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
}
