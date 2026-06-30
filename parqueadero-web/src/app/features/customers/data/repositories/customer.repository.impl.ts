import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { CUSTOMER_REMOTE_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { CustomerEntity, DocType } from '../../domain/entities/customer.entity';
import {
  CustomerRepository,
  CreateCustomerParams,
  ListCustomersParams,
  UpdateCustomerParams,
} from '../../domain/repositories/customer.repository';
import { CustomerDataSource } from '../datasources/customer.datasource';

// ──────────────────────────────────────────────────────────────────────────────
// CustomerRepositoryImpl — online-only.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable()
export class CustomerRepositoryImpl extends CustomerRepository {
  constructor(
    @Inject(CUSTOMER_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: CustomerDataSource,
  ) {
    super();
  }

  async list(
    params: ListCustomersParams,
  ): Promise<Either<Failure, { data: CustomerEntity[]; pagination: PaginationMeta }>> {
    return this.remoteDs.list(params);
  }

  async findById(id: string): Promise<Either<Failure, CustomerEntity>> {
    return this.remoteDs.findById(id);
  }

  async create(params: CreateCustomerParams): Promise<Either<Failure, CustomerEntity>> {
    return this.remoteDs.create(params);
  }

  async update(params: UpdateCustomerParams): Promise<Either<Failure, CustomerEntity>> {
    return this.remoteDs.update(params);
  }

  async deactivate(id: string): Promise<Either<Failure, void>> {
    return this.remoteDs.deactivate(id);
  }

  async existsByDoc(docType: DocType, docNumber: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    return this.remoteDs.existsByDoc(docType, docNumber, excludeId);
  }

  async existsByEmail(email: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    return this.remoteDs.existsByEmail(email, excludeId);
  }

  async countActiveMonthlyPlans(customerId: string): Promise<Either<Failure, number>> {
    return this.remoteDs.countActiveMonthlyPlans(customerId);
  }
}
