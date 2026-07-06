import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PAYMENT_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';
import {
  PaymentRepository,
  CreatePaymentParams,
  CorrectPaymentMethodParams,
  ListPaymentsParams,
  ListPaymentsResult,
  VoidPaymentParams,
} from '../../domain/repositories/payment.repository';
import { PaymentDataSource } from '../datasources/payment.datasource';

// ──────────────────────────────────────────────────────────────────────────────
// PaymentRepositoryImpl — online-only.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable()
export class PaymentRepositoryImpl extends PaymentRepository {
  constructor(
    @Inject(PAYMENT_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: PaymentDataSource,
  ) {
    super();
  }

  async create(params: CreatePaymentParams): Promise<Either<Failure, PaymentEntity>> {
    return this.remoteDs.create(params);
  }

  async list(params: ListPaymentsParams): Promise<Either<Failure, ListPaymentsResult>> {
    return this.remoteDs.list(params);
  }

  async listByShift(shiftId: string): Promise<Either<Failure, PaymentEntity[]>> {
    return this.remoteDs.listByShift(shiftId);
  }

  async sumCashByShift(shiftId: string): Promise<Either<Failure, number>> {
    return this.remoteDs.sumCashByShift(shiftId);
  }

  async correctMethod(params: CorrectPaymentMethodParams): Promise<Either<Failure, PaymentEntity>> {
    return this.remoteDs.correctMethod(params);
  }

  async voidPayment(params: VoidPaymentParams): Promise<Either<Failure, PaymentEntity>> {
    return this.remoteDs.voidPayment(params);
  }
}
