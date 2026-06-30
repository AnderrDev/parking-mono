import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { CashierShiftEntity } from '../../domain/entities/cashier-shift.entity';
import { CashWithdrawalEntity } from '../../domain/entities/cash-withdrawal.entity';
import {
  CloseShiftParams,
  ListShiftsParams,
  ListShiftsResult,
  OpenShiftParams,
  RegisterWithdrawalParams,
} from '../../domain/repositories/cashier.repository';

export abstract class CashierDataSource {
  abstract findOpen(): Promise<Either<Failure, CashierShiftEntity | null>>;
  abstract findOpenByUser(userId: string): Promise<Either<Failure, CashierShiftEntity | null>>;
  abstract findById(shiftId: string): Promise<Either<Failure, CashierShiftEntity | null>>;
  abstract create(params: OpenShiftParams): Promise<Either<Failure, CashierShiftEntity>>;
  abstract close(params: CloseShiftParams): Promise<Either<Failure, CashierShiftEntity>>;
  abstract listShifts(params: ListShiftsParams): Promise<Either<Failure, ListShiftsResult>>;
  abstract registerWithdrawal(
    params: RegisterWithdrawalParams,
  ): Promise<Either<Failure, CashWithdrawalEntity>>;
  abstract listWithdrawalsByShift(
    shiftId: string,
  ): Promise<Either<Failure, CashWithdrawalEntity[]>>;
}
