import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { MonthlyPlanEntity } from '../entities/monthly-plan.entity';
import { ParkingRepository } from '../repositories/parking.repository';
import { PARKING_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';

export interface CheckMonthlyPlanParams {
  plate: string;
}

export type CheckMonthlyPlanResult = MonthlyPlanEntity | null;

@Injectable()
export class CheckMonthlyPlanUseCase extends UseCase<CheckMonthlyPlanParams, CheckMonthlyPlanResult> {
  constructor(@Inject(PARKING_REPOSITORY_TOKEN) private readonly repo: ParkingRepository) {
    super();
  }

  execute(params: CheckMonthlyPlanParams): Promise<Either<Failure, CheckMonthlyPlanResult>> {
    const normalized = params.plate.trim().toUpperCase();
    return this.repo.getActivePlanByPlate(normalized);
  }
}
