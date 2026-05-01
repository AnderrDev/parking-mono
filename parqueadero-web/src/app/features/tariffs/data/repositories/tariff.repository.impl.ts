import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { PaginatedResult } from '../../../../shared/models/pagination.model';
import { TariffDataSource } from '../datasources/tariff.datasource';
import { TariffRepository, ListTariffsParams, CreateTariffParams, UpdateTariffParams } from '../../domain/repositories/tariff.repository';
import { TARIFF_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';

@Injectable()
export class TariffRepositoryImpl extends TariffRepository {
  constructor(
    @Inject(TARIFF_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: TariffDataSource,
  ) {
    super();
  }

  async list(params: ListTariffsParams): Promise<Either<Failure, PaginatedResult<TariffEntity>>> {
    return this.remoteDs.list(params);
  }

  async findById(id: string): Promise<Either<Failure, TariffEntity | null>> {
    return this.remoteDs.findById(id);
  }

  async create(params: CreateTariffParams): Promise<Either<Failure, TariffEntity>> {
    return this.remoteDs.create(params);
  }

  async update(id: string, params: UpdateTariffParams): Promise<Either<Failure, TariffEntity>> {
    return this.remoteDs.update(id, params);
  }

  async deactivate(id: string): Promise<Either<Failure, void>> {
    return this.remoteDs.deactivate(id);
  }

  async existsActive(name: string, vehicleType: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    return this.remoteDs.existsActive(name, vehicleType, excludeId);
  }
}
