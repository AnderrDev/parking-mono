import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { CashierShiftEntity } from '../../domain/entities/cashier-shift.entity';
import { CloseShiftParams, OpenShiftParams } from '../../domain/repositories/cashier.repository';

export abstract class CashierDataSource {
  abstract findOpenByUser(userId: string): Promise<Either<Failure, CashierShiftEntity | null>>;
  abstract findById(shiftId: string): Promise<Either<Failure, CashierShiftEntity | null>>;
  abstract create(params: OpenShiftParams): Promise<Either<Failure, CashierShiftEntity>>;
  abstract close(params: CloseShiftParams): Promise<Either<Failure, CashierShiftEntity>>;
}
