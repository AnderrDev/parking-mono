import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { CustomerEntity, DocType } from '../../domain/entities/customer.entity';
import { CreateCustomerParams, ListCustomersParams, UpdateCustomerParams } from '../../domain/repositories/customer.repository';

export abstract class CustomerDataSource {
  abstract list(params: ListCustomersParams): Promise<Either<Failure, { data: CustomerEntity[]; pagination: PaginationMeta }>>;
  abstract findById(id: string): Promise<Either<Failure, CustomerEntity>>;
  abstract create(params: CreateCustomerParams): Promise<Either<Failure, CustomerEntity>>;
  abstract update(params: UpdateCustomerParams): Promise<Either<Failure, CustomerEntity>>;
  abstract deactivate(id: string): Promise<Either<Failure, void>>;
  abstract existsByDoc(docType: DocType, docNumber: string, excludeId?: string): Promise<Either<Failure, boolean>>;
  abstract existsByEmail(email: string, excludeId?: string): Promise<Either<Failure, boolean>>;
  abstract countActiveMonthlyPlans(customerId: string): Promise<Either<Failure, number>>;
}
