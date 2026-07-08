import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { CASHIER_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { CashierShiftEntity } from '../../domain/entities/cashier-shift.entity';
import {
  CashierRepository,
  CloseShiftParams,
  CorrectOpeningBalanceParams,
  ListShiftsParams,
  ListShiftsResult,
  OpenShiftParams,
  OperatorOption,
  RegisterWithdrawalParams,
} from '../../domain/repositories/cashier.repository';
import { CashWithdrawalEntity } from '../../domain/entities/cash-withdrawal.entity';
import { CashierDataSource } from '../datasources/cashier.datasource';

// ──────────────────────────────────────────────────────────────────────────────
// CashierRepositoryImpl — online-only.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable()
export class CashierRepositoryImpl extends CashierRepository {
  constructor(
    @Inject(CASHIER_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: CashierDataSource,
  ) {
    super();
  }

  async findOpen(): Promise<Either<Failure, CashierShiftEntity | null>> {
    return this.remoteDs.findOpen();
  }

  async findOpenByUser(userId: string): Promise<Either<Failure, CashierShiftEntity | null>> {
    void userId;
    return this.findOpen();
  }

  async findById(shiftId: string): Promise<Either<Failure, CashierShiftEntity | null>> {
    return this.remoteDs.findById(shiftId);
  }

  async create(params: OpenShiftParams): Promise<Either<Failure, CashierShiftEntity>> {
    return this.remoteDs.create(params);
  }

  async correctOpeningBalance(
    params: CorrectOpeningBalanceParams,
  ): Promise<Either<Failure, CashierShiftEntity>> {
    return this.remoteDs.correctOpeningBalance(params);
  }

  async close(params: CloseShiftParams): Promise<Either<Failure, CashierShiftEntity>> {
    return this.remoteDs.close(params);
  }

  async listShifts(params: ListShiftsParams): Promise<Either<Failure, ListShiftsResult>> {
    return this.remoteDs.listShifts(params);
  }

  async listOperators(): Promise<Either<Failure, OperatorOption[]>> {
    return this.remoteDs.listOperators();
  }

  async registerWithdrawal(
    params: RegisterWithdrawalParams,
  ): Promise<Either<Failure, CashWithdrawalEntity>> {
    return this.remoteDs.registerWithdrawal(params);
  }

  async listWithdrawalsByShift(
    shiftId: string,
  ): Promise<Either<Failure, CashWithdrawalEntity[]>> {
    return this.remoteDs.listWithdrawalsByShift(shiftId);
  }
}
