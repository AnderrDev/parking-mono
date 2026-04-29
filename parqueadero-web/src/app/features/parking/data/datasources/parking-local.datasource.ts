import { Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, CacheFailure } from '../../../../core/either/failures';
import { ParkingSessionEntity } from '../../domain/entities/parking-session.entity';
import { MonthlyPlanEntity } from '../../domain/entities/monthly-plan.entity';
import {
  RegisterEntryParams,
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  insertSession(_params: RegisterEntryParams): Promise<Either<Failure, ParkingSessionEntity>> {
    return this.notImplemented();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getActiveSessionByPlate(_plate: string): Promise<Either<Failure, ParkingSessionEntity | null>> {
    return this.notImplemented();
  }

  getActiveSessions(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _filter: ActiveSessionsFilter,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _pagination: { page: number; pageSize: number },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _sort: ActiveSessionsSort,
  ): Promise<Either<Failure, ActiveSessionsPage>> {
    return this.notImplemented();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  searchVehicle(_plate: string): Promise<Either<Failure, VehicleSearchData>> {
    return this.notImplemented();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getOpenCashierShiftId(_userId: string): Promise<Either<Failure, string | null>> {
    return this.notImplemented();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getActivePlanByPlate(_plate: string): Promise<Either<Failure, MonthlyPlanEntity | null>> {
    return this.notImplemented();
  }
}
