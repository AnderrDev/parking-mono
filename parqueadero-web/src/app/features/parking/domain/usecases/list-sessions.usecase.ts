import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PARKING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import {
  ListSessionsParams,
  ListSessionsResult,
  ParkingRepository,
} from '../repositories/parking.repository';

@Injectable()
export class ListSessionsUseCase extends UseCase<ListSessionsParams, ListSessionsResult> {
  constructor(
    @Inject(PARKING_REPOSITORY_TOKEN) private readonly repo: ParkingRepository,
  ) {
    super();
  }

  async execute(params: ListSessionsParams): Promise<Either<Failure, ListSessionsResult>> {
    return this.repo.listSessions(params);
  }
}
