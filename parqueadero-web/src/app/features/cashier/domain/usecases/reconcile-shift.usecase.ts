import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NotFoundFailure } from '../../../../core/either/failures';
import { CASHIER_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { CashierShiftEntity } from '../entities/cashier-shift.entity';
import { PaymentRepository } from '../../../payments/domain/repositories/payment.repository';
import { CashierRepository } from '../repositories/cashier.repository';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';

export interface ReconcileResult {
  shift: CashierShiftEntity;
  totalSessions: number;
  totalRevenueCents: number;
  byMethod: { method: string; count: number; amountCents: number }[];
  cashExpectedCents: number;
  cashCountedCents: number | null;
  differenceCents: number | null;
  withdrawalsTotalCents: number;
}

const FREE_METHODS = ['cortesia', 'error', 'mensual'] as const;

export interface ReconcileShiftParams {
  shiftId: string;
}

@Injectable()
export class ReconcileShiftUseCase extends UseCase<ReconcileShiftParams, ReconcileResult> {
  constructor(
    @Inject(CASHIER_REPOSITORY_TOKEN) private readonly cashierRepo: CashierRepository,
    @Inject(PAYMENT_REPOSITORY_TOKEN) private readonly paymentRepo: PaymentRepository,
  ) {
    super();
  }

  async execute(params: ReconcileShiftParams): Promise<Either<Failure, ReconcileResult>> {
    const shiftResult = await this.cashierRepo.findById(params.shiftId);
    if (shiftResult.isLeft()) return left(shiftResult.value);
    const shift = shiftResult.value;
    if (!shift) {
      return left(new NotFoundFailure('Turno no encontrado', 'cashier_shift'));
    }

    const paymentsResult = await this.paymentRepo.listByShift(params.shiftId);
    if (paymentsResult.isLeft()) return left(paymentsResult.value);
    const payments = paymentsResult.value as PaymentEntity[];

    const completed = payments.filter((p) => p.status === 'completed');

    const byMethodMap = new Map<string, { count: number; amountCents: number }>();
    for (const p of completed) {
      const entry = byMethodMap.get(p.method) ?? { count: 0, amountCents: 0 };
      byMethodMap.set(p.method, {
        count: entry.count + 1,
        amountCents: entry.amountCents + p.amountCents,
      });
    }

    const byMethod = Array.from(byMethodMap.entries()).map(([method, v]) => ({
      method,
      count: v.count,
      amountCents: v.amountCents,
    }));

    const totalRevenueCents = completed
      .filter((p) => !(FREE_METHODS as readonly string[]).includes(p.method))
      .reduce((acc, p) => acc + p.amountCents, 0);

    const cashSum = completed
      .filter((p) => p.method === 'efectivo')
      .reduce((acc, p) => acc + p.amountCents, 0);

    // HU-039: restar retiros parciales del efectivo esperado.
    const withdrawalsResult = await this.cashierRepo.listWithdrawalsByShift(params.shiftId);
    const withdrawals = withdrawalsResult.fold(
      () => [],
      (list) => list,
    );
    const withdrawalsTotal = withdrawals.reduce((acc, w) => acc + w.amountCents, 0);

    const cashExpected = shift.openingBalanceCents + cashSum - withdrawalsTotal;

    const result: ReconcileResult = {
      shift,
      totalSessions: completed.length,
      totalRevenueCents,
      byMethod,
      cashExpectedCents: cashExpected,
      cashCountedCents: shift.closingBalanceCents,
      differenceCents: shift.isOpen ? null : (shift.closingBalanceCents ?? 0) - cashExpected,
      withdrawalsTotalCents: withdrawalsTotal,
    };

    return right(result);
  }
}
