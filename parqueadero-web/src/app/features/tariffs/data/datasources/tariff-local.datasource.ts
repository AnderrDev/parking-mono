import { Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, CacheFailure } from '../../../../core/either/failures';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { PaginatedResult } from '../../../../shared/models/pagination.model';
import { TariffDataSource } from './tariff.datasource';
import { ListTariffsParams, CreateTariffParams, UpdateTariffParams } from '../../domain/repositories/tariff.repository';

@Injectable()
export class TariffLocalDataSource extends TariffDataSource {
  private readonly stub = <T>(): Promise<Either<Failure, T>> =>
    Promise.resolve(left(new CacheFailure('Almacenamiento local no disponible en esta fase.')));

  list(_params: ListTariffsParams): Promise<Either<Failure, PaginatedResult<TariffEntity>>> { return this.stub(); }
  findById(_id: string): Promise<Either<Failure, TariffEntity | null>> { return this.stub(); }
  create(_params: CreateTariffParams): Promise<Either<Failure, TariffEntity>> { return this.stub(); }
  update(_id: string, _params: UpdateTariffParams): Promise<Either<Failure, TariffEntity>> { return this.stub(); }
  deactivate(_id: string): Promise<Either<Failure, void>> { return this.stub(); }
  existsActive(_name: string, _vehicleType: string, _excludeId?: string): Promise<Either<Failure, boolean>> { return this.stub(); }
}
