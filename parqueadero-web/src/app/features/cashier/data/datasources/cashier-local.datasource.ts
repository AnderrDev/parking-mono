import { Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { CacheFailure, Failure } from '../../../../core/either/failures';
import { CashierShiftEntity } from '../../domain/entities/cashier-shift.entity';
import { CloseShiftParams, OpenShiftParams } from '../../domain/repositories/cashier.repository';
import { CashierDataSource } from './cashier.datasource';

@Injectable()
export class CashierLocalDataSource extends CashierDataSource {
  async findOpenByUser(_userId: string): Promise<Either<Failure, CashierShiftEntity | null>> {
    return left(new CacheFailure('CashierLocalDataSource not implemented until Fase 8'));
  }

  async findById(_shiftId: string): Promise<Either<Failure, CashierShiftEntity | null>> {
    return left(new CacheFailure('CashierLocalDataSource not implemented until Fase 8'));
  }

  async create(_params: OpenShiftParams): Promise<Either<Failure, CashierShiftEntity>> {
    return left(new CacheFailure('CashierLocalDataSource not implemented until Fase 8'));
  }

  async close(_params: CloseShiftParams): Promise<Either<Failure, CashierShiftEntity>> {
    return left(new CacheFailure('CashierLocalDataSource not implemented until Fase 8'));
  }
}
