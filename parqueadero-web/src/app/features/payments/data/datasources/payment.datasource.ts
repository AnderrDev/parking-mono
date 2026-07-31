import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaymentEntity } from '../../../parking/domain/entities/payment.entity';
import {
  CreatePaymentParams,
  CorrectPaymentAmountParams,
  CorrectPaymentMethodParams,
  ListPaymentsParams,
  ListPaymentsResult,
  PaymentWithVehicle,
  VoidPaymentParams,
} from '../../domain/repositories/payment.repository';

export abstract class PaymentDataSource {
  abstract create(params: CreatePaymentParams): Promise<Either<Failure, PaymentEntity>>;
  abstract list(params: ListPaymentsParams): Promise<Either<Failure, ListPaymentsResult>>;
  abstract listByShift(shiftId: string): Promise<Either<Failure, PaymentEntity[]>>;
  abstract listByShiftWithVehicle(shiftId: string): Promise<Either<Failure, PaymentWithVehicle[]>>;
  abstract sumCashByShift(shiftId: string): Promise<Either<Failure, number>>;
  abstract correctMethod(params: CorrectPaymentMethodParams): Promise<Either<Failure, PaymentEntity>>;
  abstract correctAmount(params: CorrectPaymentAmountParams): Promise<Either<Failure, PaymentEntity>>;
  abstract voidPayment(params: VoidPaymentParams): Promise<Either<Failure, PaymentEntity>>;
}
