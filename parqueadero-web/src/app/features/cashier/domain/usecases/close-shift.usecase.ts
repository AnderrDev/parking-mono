import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left } from '../../../../core/either/either';
import { Failure, NotFoundFailure, ValidationFailure } from '../../../../core/either/failures';
import {
  CASHIER_REPOSITORY_TOKEN,
  PAYMENT_REPOSITORY_TOKEN,
} from '../../../../core/di/injection-tokens';
import { CashierShiftEntity, ShiftMethodTotal } from '../entities/cashier-shift.entity';
import { CashierRepository } from '../repositories/cashier.repository';
import { PaymentRepository } from '../../../payments/domain/repositories/payment.repository';
import {
  DIGITAL_PAYMENT_METHODS,
  PaymentEntity,
} from '../../../parking/domain/entities/payment.entity';

export interface CloseShiftParams {
  shiftId: string;
  userId: string;
  closingBalanceCents: number;
  /** Total digital verificado en cuentas por el operador; null = no verificó. */
  digitalVerifiedCents: number | null;
  justification: string | null;
}

const LARGE_DIFF_THRESHOLD_CENTS = 500_000;

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
    if (params.digitalVerifiedCents !== null && params.digitalVerifiedCents < 0) {
      return left(new ValidationFailure('El total digital verificado no puede ser negativo'));
    }

    const shiftResult = await this.cashierRepo.findById(params.shiftId);
    if (shiftResult.isLeft()) return left(shiftResult.value);
    const shift = shiftResult.value;
    if (!shift || shift.status !== 'open') {
      return left(new NotFoundFailure('Turno no encontrado o ya cerrado', 'cashier_shift'));
    }

    // Desglose por método (spec close-shift): efectivo cuadra el cajón,
    // digital se verifica en cuentas, y el snapshot completo queda
    // persistido para el historial.
    const paymentsResult = await this.paymentRepo.listByShift(params.shiftId);
    if (paymentsResult.isLeft()) return left(paymentsResult.value);
    const completed = (paymentsResult.value as PaymentEntity[]).filter(
      (p) => p.status === 'completed',
    );

    const byMethodMap = new Map<string, ShiftMethodTotal>();
    for (const p of completed) {
      const entry = byMethodMap.get(p.method) ?? { method: p.method, count: 0, amountCents: 0 };
      entry.count += 1;
      entry.amountCents += p.amountCents;
      byMethodMap.set(p.method, entry);
    }
    const totalsByMethod = Array.from(byMethodMap.values());

    const cashCollected = byMethodMap.get('efectivo')?.amountCents ?? 0;
    const digitalCollected = totalsByMethod
      .filter((t) => (DIGITAL_PAYMENT_METHODS as readonly string[]).includes(t.method))
      .reduce((acc, t) => acc + t.amountCents, 0);

    // Los movimientos manuales (HU-039) solo tocan efectivo físico. Mantener
    // simetría con `ReconcileShiftUseCase` (UI).
    const withdrawalsResult = await this.cashierRepo.listWithdrawalsByShift(params.shiftId);
    if (withdrawalsResult.isLeft()) return left(withdrawalsResult.value);
    const withdrawalsTotal = withdrawalsResult.value
      .filter((w) => w.movementType === 'out')
      .reduce((acc, w) => acc + w.amountCents, 0);
    const manualIncome = withdrawalsResult.value
      .filter((w) => w.movementType === 'in')
      .reduce((acc, w) => acc + w.amountCents, 0);

    const expected = shift.openingBalanceCents + cashCollected + manualIncome - withdrawalsTotal;
    const difference = params.closingBalanceCents - expected;

    const justification = params.justification?.trim() || null;
    if (Math.abs(difference) > LARGE_DIFF_THRESHOLD_CENTS && !justification) {
      return left(
        new ValidationFailure('La diferencia supera $5.000. Ingresa una justificación.'),
      );
    }

    return this.cashierRepo.close({
      shiftId: params.shiftId,
      closingBalanceCents: params.closingBalanceCents,
      expectedBalanceCents: expected,
      differenceCents: difference,
      justification,
      cashCollectedCents: cashCollected,
      digitalCollectedCents: digitalCollected,
      digitalVerifiedCents: params.digitalVerifiedCents,
      totalsByMethod,
    });
  }
}
