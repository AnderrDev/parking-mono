import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { PAYMENT_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { PaymentMethod } from '../../../parking/domain/entities/payment.entity';
import { PaymentRepository, ListPaymentsParams, ListPaymentsResult } from '../repositories/payment.repository';

export type { ListPaymentsParams, ListPaymentsResult };

export interface ListPaymentsUseCaseParams {
  shiftId?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  method?: PaymentMethod | null;
  status?: 'completed' | 'pending' | null;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ListPaymentsUseCase extends UseCase<ListPaymentsUseCaseParams, ListPaymentsResult> {
  constructor(@Inject(PAYMENT_REPOSITORY_TOKEN) private readonly repo: PaymentRepository) {
    super();
  }

  async execute(params: ListPaymentsUseCaseParams): Promise<Either<Failure, ListPaymentsResult>> {
    const hasShiftId = !!params.shiftId;
    const hasDateFrom = !!params.dateFrom;

    if (!hasShiftId && !hasDateFrom) {
      return left(new ValidationFailure('Se requiere shiftId o dateFrom'));
    }

    if (params.dateFrom && params.dateTo && params.dateTo < params.dateFrom) {
      return left(new ValidationFailure('dateTo debe ser ≥ dateFrom'));
    }

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 50));

    const repoParams: ListPaymentsParams = {
      ...(params.shiftId ? { shiftId: params.shiftId } : {}),
      ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
      ...(params.dateTo ? { dateTo: params.dateTo } : {}),
      ...(params.method ? { method: params.method } : {}),
      ...(params.status ? { status: params.status } : {}),
      page,
      pageSize,
    };

    return this.repo.list(repoParams);
  }
}
