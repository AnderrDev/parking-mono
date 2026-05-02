import { Inject, Injectable } from '@angular/core';
import { Either, right } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { PARKING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { ParkingRepository } from '../repositories/parking.repository';

export interface GetOpenShiftStatusParams {
  userId: string;
}

export interface OpenShiftStatus {
  isOpen: boolean;
  shiftId: string | null;
  openedAt: Date | null;
  openingBalanceCents: number | null;
}

@Injectable()
export class GetOpenShiftStatusUseCase extends UseCase<
  GetOpenShiftStatusParams,
  OpenShiftStatus
> {
  constructor(
    @Inject(PARKING_REPOSITORY_TOKEN) private readonly repo: ParkingRepository,
  ) {
    super();
  }

  async execute(
    params: GetOpenShiftStatusParams,
  ): Promise<Either<Failure, OpenShiftStatus>> {
    const result = await this.repo.getOpenShiftSummary(params.userId);
    return result.map<OpenShiftStatus>((summary) =>
      summary === null
        ? { isOpen: false, shiftId: null, openedAt: null, openingBalanceCents: null }
        : {
            isOpen: true,
            shiftId: summary.shiftId,
            openedAt: summary.openedAt,
            openingBalanceCents: summary.openingBalanceCents,
          },
    );
  }
}
