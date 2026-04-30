import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { CASHIER_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { CashierShiftEntity } from '../../domain/entities/cashier-shift.entity';
import { CashierRepository, CloseShiftParams, OpenShiftParams } from '../../domain/repositories/cashier.repository';
import { CashierDataSource } from '../datasources/cashier.datasource';

@Injectable()
export class CashierRepositoryImpl extends CashierRepository {
  constructor(
    @Inject(CASHIER_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: CashierDataSource,
  ) {
    super();
  }

  async findOpenByUser(userId: string): Promise<Either<Failure, CashierShiftEntity | null>> {
    return this.remoteDs.findOpenByUser(userId);
  }

  async findById(shiftId: string): Promise<Either<Failure, CashierShiftEntity | null>> {
    return this.remoteDs.findById(shiftId);
  }

  async create(params: OpenShiftParams): Promise<Either<Failure, CashierShiftEntity>> {
    return this.remoteDs.create(params);
  }

  async close(params: CloseShiftParams): Promise<Either<Failure, CashierShiftEntity>> {
    return this.remoteDs.close(params);
  }
}
