import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { CashierShiftEntity } from '../entities/cashier-shift.entity';

export interface OpenShiftParams {
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

export abstract class CashierRepository {
  abstract findOpenByUser(userId: string): Promise<Either<Failure, CashierShiftEntity | null>>;
  abstract findById(shiftId: string): Promise<Either<Failure, CashierShiftEntity | null>>;
  abstract create(params: OpenShiftParams): Promise<Either<Failure, CashierShiftEntity>>;
  abstract close(params: CloseShiftParams): Promise<Either<Failure, CashierShiftEntity>>;
}
