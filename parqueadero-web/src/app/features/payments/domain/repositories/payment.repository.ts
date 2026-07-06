import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { PaymentEntity, PaymentMethod } from '../../../parking/domain/entities/payment.entity';

export interface CreatePaymentParams {
  sessionId: string | null;
  cashierShiftId: string;
  method: PaymentMethod;
  amountCents: number;
  invoiceId: string | null;
  gatewayRef: string | null;
}

export interface ListPaymentsParams {
  shiftId?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  method?: PaymentMethod | null;
  status?: 'completed' | 'pending' | null;
  page: number;
  pageSize: number;
}

export interface ListPaymentsResult {
  data: PaymentEntity[];
  pagination: PaginationMeta;
  totalCents: number;
}

export interface VoidPaymentParams {
  paymentId: string;
  reason: string;
}

export interface CorrectPaymentMethodParams {
  paymentId: string;
  method: PaymentMethod;
  userId: string;
}

export abstract class PaymentRepository {
  abstract create(params: CreatePaymentParams): Promise<Either<Failure, PaymentEntity>>;
  abstract list(params: ListPaymentsParams): Promise<Either<Failure, ListPaymentsResult>>;
  abstract listByShift(shiftId: string): Promise<Either<Failure, PaymentEntity[]>>;
  abstract sumCashByShift(shiftId: string): Promise<Either<Failure, number>>;
  abstract correctMethod(params: CorrectPaymentMethodParams): Promise<Either<Failure, PaymentEntity>>;
  abstract voidPayment(params: VoidPaymentParams): Promise<Either<Failure, PaymentEntity>>;
}
