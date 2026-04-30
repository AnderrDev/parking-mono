import { Injectable } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { CacheFailure, Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { CustomerEntity, DocType } from '../../domain/entities/customer.entity';
import { CreateCustomerParams, ListCustomersParams, UpdateCustomerParams } from '../../domain/repositories/customer.repository';
import { CustomerDataSource } from './customer.datasource';

@Injectable()
export class CustomerLocalDataSource extends CustomerDataSource {
  private stub(): Either<Failure, never> {
    return left(new CacheFailure('Local datasource no disponible hasta Fase 8'));
  }

  list(_p: ListCustomersParams): Promise<Either<Failure, { data: CustomerEntity[]; pagination: PaginationMeta }>> {
    return Promise.resolve(this.stub());
  }
  findById(_id: string): Promise<Either<Failure, CustomerEntity>> { return Promise.resolve(this.stub()); }
  create(_p: CreateCustomerParams): Promise<Either<Failure, CustomerEntity>> { return Promise.resolve(this.stub()); }
  update(_p: UpdateCustomerParams): Promise<Either<Failure, CustomerEntity>> { return Promise.resolve(this.stub()); }
  deactivate(_id: string): Promise<Either<Failure, void>> { return Promise.resolve(this.stub()); }
  existsByDoc(_t: DocType, _n: string, _ex?: string): Promise<Either<Failure, boolean>> { return Promise.resolve(this.stub()); }
  existsByEmail(_e: string, _ex?: string): Promise<Either<Failure, boolean>> { return Promise.resolve(this.stub()); }
  countActiveMonthlyPlans(_id: string): Promise<Either<Failure, number>> { return Promise.resolve(this.stub()); }
}
