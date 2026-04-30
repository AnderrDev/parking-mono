import { Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { CacheFailure, Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { MonthlyPlanEntity } from '../../../parking/domain/entities/monthly-plan.entity';
import { CreateMonthlyPlanParams, ListMonthlyPlansParams, UpdateMonthlyPlanParams } from '../../domain/repositories/monthly-plan.repository';
import { MonthlyPlanDataSource } from './monthly-plan.datasource';

@Injectable()
export class MonthlyPlanLocalDataSource extends MonthlyPlanDataSource {
  private stub(): Either<Failure, never> {
    return left(new CacheFailure('Local datasource no disponible hasta Fase 8'));
  }

  list(_p: ListMonthlyPlansParams): Promise<Either<Failure, { data: MonthlyPlanEntity[]; pagination: PaginationMeta }>> {
    return Promise.resolve(this.stub());
  }
  findById(_id: string): Promise<Either<Failure, MonthlyPlanEntity>> { return Promise.resolve(this.stub()); }
  create(_p: CreateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> { return Promise.resolve(this.stub()); }
  update(_p: UpdateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>> { return Promise.resolve(this.stub()); }
  cancel(_id: string): Promise<Either<Failure, void>> { return Promise.resolve(this.stub()); }
  hasActivePlanForPlate(_plate: string, _ex?: string): Promise<Either<Failure, boolean>> { return Promise.resolve(this.stub()); }
}
