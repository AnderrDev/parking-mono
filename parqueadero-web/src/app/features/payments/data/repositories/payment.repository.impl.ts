import { Inject, Injectable, inject } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure, NetworkFailure } from '../../../../core/either/failures';
import { PAYMENT_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { NetworkInfoService } from '../../../../core/services/network-info.service';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';
import {
  PaymentRepository,
  CreatePaymentParams,
  ListPaymentsParams,
  ListPaymentsResult,
  VoidPaymentParams,
} from '../../domain/repositories/payment.repository';
import { PaymentDataSource } from '../datasources/payment.datasource';
import { PaymentLocalDataSource } from '../datasources/payment-local.datasource';

// ──────────────────────────────────────────────────────────────────────────────
// PaymentRepositoryImpl — Sprint 2.
// Mismo patrón online-first → fallback local en NetworkFailure que
// ParkingRepositoryImpl. `create` queda optimista: si online falla con
// NetworkFailure, persiste local + outbox.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable()
export class PaymentRepositoryImpl extends PaymentRepository {
  private readonly localDs = inject(PaymentLocalDataSource);
  private readonly networkInfo = inject(NetworkInfoService);

  constructor(
    @Inject(PAYMENT_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: PaymentDataSource,
  ) {
    super();
  }

  async create(params: CreatePaymentParams): Promise<Either<Failure, PaymentEntity>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.create(params);
    }
    const remote = await this.remoteDs.create(params);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.create(params);
    }
    return remote;
  }

  async list(params: ListPaymentsParams): Promise<Either<Failure, ListPaymentsResult>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.list(params);
    }
    const remote = await this.remoteDs.list(params);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.list(params);
    }
    return remote;
  }

  async listByShift(shiftId: string): Promise<Either<Failure, PaymentEntity[]>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.listByShift(shiftId);
    }
    const remote = await this.remoteDs.listByShift(shiftId);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.listByShift(shiftId);
    }
    return remote;
  }

  async sumCashByShift(shiftId: string): Promise<Either<Failure, number>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.sumCashByShift(shiftId);
    }
    const remote = await this.remoteDs.sumCashByShift(shiftId);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.sumCashByShift(shiftId);
    }
    return remote;
  }

  async voidPayment(params: VoidPaymentParams): Promise<Either<Failure, PaymentEntity>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.voidPayment(params);
    }
    return this.remoteDs.voidPayment(params);
  }
}
