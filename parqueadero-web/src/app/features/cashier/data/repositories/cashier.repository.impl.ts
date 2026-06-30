import { Inject, Injectable, inject } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure, NetworkFailure } from '../../../../core/either/failures';
import { CASHIER_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { NetworkInfoService } from '../../../../core/services/network-info.service';
import { CashierShiftEntity } from '../../domain/entities/cashier-shift.entity';
import {
  CashierRepository,
  CloseShiftParams,
  ListShiftsParams,
  ListShiftsResult,
  OpenShiftParams,
  RegisterWithdrawalParams,
} from '../../domain/repositories/cashier.repository';
import { CashWithdrawalEntity } from '../../domain/entities/cash-withdrawal.entity';
import { CashierDataSource } from '../datasources/cashier.datasource';
import { CashierLocalDataSource } from '../datasources/cashier-local.datasource';

// ──────────────────────────────────────────────────────────────────────────────
// CashierRepositoryImpl — Sprint 2.
// Mismo patrón online-first → fallback offline. `create` y `close` mantienen
// el shift en `_sync_status='pending'` mientras drena, lo cual permite que
// los payments y cash_withdrawals que referencian el shiftId puedan
// resolver la FK de forma diferida (FIFO global de outbox respeta el orden).
// ──────────────────────────────────────────────────────────────────────────────
@Injectable()
export class CashierRepositoryImpl extends CashierRepository {
  private readonly localDs = inject(CashierLocalDataSource);
  private readonly networkInfo = inject(NetworkInfoService);

  constructor(
    @Inject(CASHIER_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: CashierDataSource,
  ) {
    super();
  }

  async findOpen(): Promise<Either<Failure, CashierShiftEntity | null>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.findOpen();
    }
    const remote = await this.remoteDs.findOpen();
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.findOpen();
    }
    return remote;
  }

  async findOpenByUser(userId: string): Promise<Either<Failure, CashierShiftEntity | null>> {
    void userId;
    return this.findOpen();
  }

  async findById(shiftId: string): Promise<Either<Failure, CashierShiftEntity | null>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.findById(shiftId);
    }
    const remote = await this.remoteDs.findById(shiftId);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.findById(shiftId);
    }
    return remote;
  }

  async create(params: OpenShiftParams): Promise<Either<Failure, CashierShiftEntity>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.create(params);
    }
    const remote = await this.remoteDs.create(params);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.create(params);
    }
    return remote;
  }

  async close(params: CloseShiftParams): Promise<Either<Failure, CashierShiftEntity>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.close(params);
    }
    const remote = await this.remoteDs.close(params);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.close(params);
    }
    return remote;
  }

  async listShifts(params: ListShiftsParams): Promise<Either<Failure, ListShiftsResult>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.listShifts(params);
    }
    const remote = await this.remoteDs.listShifts(params);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.listShifts(params);
    }
    return remote;
  }

  async registerWithdrawal(
    params: RegisterWithdrawalParams,
  ): Promise<Either<Failure, CashWithdrawalEntity>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.registerWithdrawal(params);
    }
    const remote = await this.remoteDs.registerWithdrawal(params);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.registerWithdrawal(params);
    }
    return remote;
  }

  async listWithdrawalsByShift(
    shiftId: string,
  ): Promise<Either<Failure, CashWithdrawalEntity[]>> {
    if (!this.networkInfo.isOnline()) {
      return this.localDs.listWithdrawalsByShift(shiftId);
    }
    const remote = await this.remoteDs.listWithdrawalsByShift(shiftId);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.listWithdrawalsByShift(shiftId);
    }
    return remote;
  }
}
