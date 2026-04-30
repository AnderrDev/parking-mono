import { Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, CacheFailure } from '../../../../core/either/failures';
import { ParkingSessionEntity, VehicleType } from '../../domain/entities/parking-session.entity';
import { MonthlyPlanEntity } from '../../domain/entities/monthly-plan.entity';
import { TariffEntity } from '../../domain/entities/tariff.entity';
import {
  RegisterEntryParams,
  RegisterExitParams,
  RegisterExitResult,
  ActiveSessionsFilter,
  ActiveSessionsSort,
} from '../../domain/repositories/parking.repository';
import {
  ParkingDataSource,
  ActiveSessionsPage,
  VehicleSearchData,
} from './parking.datasource';

// Fase 8: PowerSync integration. Placeholder retorna error para forzar
// uso del datasource remoto hasta que se implemente offline real.
@Injectable()
export class ParkingLocalDataSource extends ParkingDataSource {
  private notImplemented<T>(): Promise<Either<Failure, T>> {
    return Promise.resolve(
      left(new CacheFailure('Almacenamiento local no disponible en esta fase.')),
    );
  }

  insertSession(_params: RegisterEntryParams): Promise<Either<Failure, ParkingSessionEntity>> {
    return this.notImplemented();
  }

  getActiveSessionByPlate(_plate: string): Promise<Either<Failure, ParkingSessionEntity | null>> {
    return this.notImplemented();
  }

  getActiveSessions(
    _filter: ActiveSessionsFilter,
    _pagination: { page: number; pageSize: number },
    _sort: ActiveSessionsSort,
  ): Promise<Either<Failure, ActiveSessionsPage>> {
    return this.notImplemented();
  }

  searchVehicle(_plate: string): Promise<Either<Failure, VehicleSearchData>> {
    return this.notImplemented();
  }

  getOpenCashierShiftId(_userId: string): Promise<Either<Failure, string | null>> {
    return this.notImplemented();
  }

  getActivePlanByPlate(_plate: string): Promise<Either<Failure, MonthlyPlanEntity | null>> {
    return this.notImplemented();
  }

  closeSession(_params: RegisterExitParams): Promise<Either<Failure, RegisterExitResult>> {
    return this.notImplemented();
  }

  getActiveTariff(_vehicleType: VehicleType): Promise<Either<Failure, TariffEntity>> {
    return this.notImplemented();
  }
}
