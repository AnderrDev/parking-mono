import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { CashierShiftEntity } from '../entities/cashier-shift.entity';
import { CashWithdrawalEntity } from '../entities/cash-withdrawal.entity';

export interface OpenShiftParams {
  userId: string;
  openingBalanceCents: number;
}

export interface CorrectOpeningBalanceParams {
  shiftId: string;
  userId: string;
  openingBalanceCents: number;
}

export interface CloseShiftParams {
  shiftId: string;
  closingBalanceCents: number;
  expectedBalanceCents: number;
  differenceCents: number;
  justification: string | null;
}

export interface ListShiftsParams {
  userId?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  onlyWithDifference?: boolean;
  page: number;
  pageSize: number;
}

export interface ShiftWithOperator {
  shift: CashierShiftEntity;
  operatorName: string;
}

export interface ListShiftsResult {
  data: ShiftWithOperator[];
  pagination: PaginationMeta;
}

export interface RegisterWithdrawalParams {
  shiftId: string;
  userId: string;
  amountCents: number;
  recipient: string;
  justification: string;
  movementType?: 'in' | 'out';
}

export abstract class CashierRepository {
  abstract findOpen(): Promise<Either<Failure, CashierShiftEntity | null>>;
  abstract findOpenByUser(userId: string): Promise<Either<Failure, CashierShiftEntity | null>>;
  abstract findById(shiftId: string): Promise<Either<Failure, CashierShiftEntity | null>>;
  abstract create(params: OpenShiftParams): Promise<Either<Failure, CashierShiftEntity>>;
  abstract correctOpeningBalance(
    params: CorrectOpeningBalanceParams,
  ): Promise<Either<Failure, CashierShiftEntity>>;
  abstract close(params: CloseShiftParams): Promise<Either<Failure, CashierShiftEntity>>;
  abstract listShifts(params: ListShiftsParams): Promise<Either<Failure, ListShiftsResult>>;
  abstract registerWithdrawal(
    params: RegisterWithdrawalParams,
  ): Promise<Either<Failure, CashWithdrawalEntity>>;
  abstract listWithdrawalsByShift(
    shiftId: string,
  ): Promise<Either<Failure, CashWithdrawalEntity[]>>;
}
