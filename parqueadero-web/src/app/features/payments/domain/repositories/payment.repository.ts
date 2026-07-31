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

/** Pago enriquecido con la placa/hora de entrada de la sesión asociada (join, no persistido en PaymentEntity). */
export interface PaymentWithVehicle {
  payment: PaymentEntity;
  plate: string | null;
  entryAt: Date | null;
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

export interface CorrectPaymentAmountParams {
  paymentId: string;
  amountCents: number;
  reason: string;
  userId: string;
}

export abstract class PaymentRepository {
  abstract create(params: CreatePaymentParams): Promise<Either<Failure, PaymentEntity>>;
  abstract list(params: ListPaymentsParams): Promise<Either<Failure, ListPaymentsResult>>;
  abstract listByShift(shiftId: string): Promise<Either<Failure, PaymentEntity[]>>;
  abstract listByShiftWithVehicle(shiftId: string): Promise<Either<Failure, PaymentWithVehicle[]>>;
  abstract sumCashByShift(shiftId: string): Promise<Either<Failure, number>>;
  abstract correctMethod(params: CorrectPaymentMethodParams): Promise<Either<Failure, PaymentEntity>>;
  abstract correctAmount(params: CorrectPaymentAmountParams): Promise<Either<Failure, PaymentEntity>>;
  abstract voidPayment(params: VoidPaymentParams): Promise<Either<Failure, PaymentEntity>>;
}
