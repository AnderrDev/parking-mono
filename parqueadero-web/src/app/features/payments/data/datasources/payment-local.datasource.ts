import { Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { CacheFailure, Failure } from '../../../../core/either/failures';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';
import { CreatePaymentParams, ListPaymentsParams, ListPaymentsResult } from '../../domain/repositories/payment.repository';
import { PaymentDataSource } from './payment.datasource';

@Injectable()
export class PaymentLocalDataSource extends PaymentDataSource {
  async create(_params: CreatePaymentParams): Promise<Either<Failure, PaymentEntity>> {
    return left(new CacheFailure('PaymentLocalDataSource not implemented until Fase 8'));
  }

  async list(_params: ListPaymentsParams): Promise<Either<Failure, ListPaymentsResult>> {
    return left(new CacheFailure('PaymentLocalDataSource not implemented until Fase 8'));
  }

  async listByShift(_shiftId: string): Promise<Either<Failure, PaymentEntity[]>> {
    return left(new CacheFailure('PaymentLocalDataSource not implemented until Fase 8'));
  }

  async sumCashByShift(_shiftId: string): Promise<Either<Failure, number>> {
    return left(new CacheFailure('PaymentLocalDataSource not implemented until Fase 8'));
  }
}
