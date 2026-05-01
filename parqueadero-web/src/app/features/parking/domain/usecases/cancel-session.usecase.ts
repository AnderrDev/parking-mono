import { Inject, Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, ValidationFailure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PARKING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { CancelSessionParams, ParkingRepository } from '../repositories/parking.repository';
import { ParkingSessionEntity } from '../entities/parking-session.entity';

@Injectable()
export class CancelParkingSessionUseCase extends UseCase<CancelSessionParams, ParkingSessionEntity> {
  constructor(
    @Inject(PARKING_REPOSITORY_TOKEN) private readonly repo: ParkingRepository,
  ) {
    super();
  }

  async execute(params: CancelSessionParams): Promise<Either<Failure, ParkingSessionEntity>> {
    if (!params.sessionId) {
      return left(new ValidationFailure('sessionId es requerido', 'sessionId'));
    }
    const reason = params.reason?.trim() ?? '';
    if (reason.length < 10) {
      return left(
        new ValidationFailure(
          'El motivo de la anulación debe tener al menos 10 caracteres',
          'reason',
        ),
      );
    }
    return this.repo.cancelSession({ ...params, reason });
  }
}
