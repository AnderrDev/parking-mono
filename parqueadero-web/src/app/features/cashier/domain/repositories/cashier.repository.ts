import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { CashierShiftEntity, ShiftMethodTotal } from '../entities/cashier-shift.entity';
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
  /** Desglose por canal al cierre (spec close-shift). */
  cashCollectedCents: number;
  digitalCollectedCents: number;
  /** null = el operador no verificó las cuentas (distinto de $0). */
  digitalVerifiedCents: number | null;
  totalsByMethod: ShiftMethodTotal[];
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

/** Opción del filtro de operador en el historial de turnos. */
export interface OperatorOption {
  id: string;
  nombre: string;
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
  /** Operadores activos para el filtro del historial (solo admin/contador). */
  abstract listOperators(): Promise<Either<Failure, OperatorOption[]>>;
  abstract registerWithdrawal(
    params: RegisterWithdrawalParams,
  ): Promise<Either<Failure, CashWithdrawalEntity>>;
  abstract listWithdrawalsByShift(
    shiftId: string,
  ): Promise<Either<Failure, CashWithdrawalEntity[]>>;
}
