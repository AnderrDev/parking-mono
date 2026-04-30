import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { PaginatedResult } from '../../../../shared/models/pagination.model';
import { ListTariffsParams, CreateTariffParams, UpdateTariffParams } from '../../domain/repositories/tariff.repository';

export abstract class TariffDataSource {
  abstract list(params: ListTariffsParams): Promise<Either<Failure, PaginatedResult<TariffEntity>>>;
  abstract findById(id: string): Promise<Either<Failure, TariffEntity | null>>;
  abstract create(params: CreateTariffParams): Promise<Either<Failure, TariffEntity>>;
  abstract update(id: string, params: UpdateTariffParams): Promise<Either<Failure, TariffEntity>>;
  abstract deactivate(id: string): Promise<Either<Failure, void>>;
  abstract existsActive(name: string, vehicleType: string, excludeId?: string): Promise<Either<Failure, boolean>>;
}
