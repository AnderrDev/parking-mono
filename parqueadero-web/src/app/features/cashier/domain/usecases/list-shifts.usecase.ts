import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { CASHIER_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import {
  CashierRepository,
  ListShiftsParams,
  ListShiftsResult,
} from '../repositories/cashier.repository';

@Injectable()
export class ListShiftsUseCase extends UseCase<ListShiftsParams, ListShiftsResult> {
  constructor(
    @Inject(CASHIER_REPOSITORY_TOKEN) private readonly repo: CashierRepository,
  ) {
    super();
  }

  async execute(params: ListShiftsParams): Promise<Either<Failure, ListShiftsResult>> {
    return this.repo.listShifts(params);
  }
}
