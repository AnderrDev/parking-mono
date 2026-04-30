import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase, NoParams } from '../../../../core/base/usecase';
import { PARKING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { ParkingRepository, ActiveSessionsResult } from '../repositories/parking.repository';

@Injectable()
export class GetActiveSessionsUseCase extends UseCase<NoParams, ActiveSessionsResult> {
  constructor(
    @Inject(PARKING_REPOSITORY_TOKEN) private readonly repo: ParkingRepository,
  ) {
    super();
  }

  execute(_params: NoParams): Promise<Either<Failure, ActiveSessionsResult>> {
    return this.repo.getActiveSessions(
      {},
      { page: 1, pageSize: 100 },
      { field: 'entryAt', direction: 'asc' },
    );
  }
}
