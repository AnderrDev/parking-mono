import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';
import { CreatePaymentParams, ListPaymentsParams, ListPaymentsResult } from '../../domain/repositories/payment.repository';

export abstract class PaymentDataSource {
  abstract create(params: CreatePaymentParams): Promise<Either<Failure, PaymentEntity>>;
  abstract list(params: ListPaymentsParams): Promise<Either<Failure, ListPaymentsResult>>;
  abstract listByShift(shiftId: string): Promise<Either<Failure, PaymentEntity[]>>;
  abstract sumCashByShift(shiftId: string): Promise<Either<Failure, number>>;
}
