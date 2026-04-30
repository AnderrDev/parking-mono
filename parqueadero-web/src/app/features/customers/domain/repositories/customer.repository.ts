import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { SortParams } from '../../../../shared/models/sort.model';
import { CustomerEntity, DocType } from '../entities/customer.entity';

export interface ListCustomersParams {
  search?: string | null;
  includeDeleted?: boolean;
  pagination?: { page: number; pageSize: number };
  sort?: SortParams;
}

export interface CreateCustomerParams {
  docType: DocType;
  docNumber: string;
  dv?: number | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  municipio?: string | null;
  departamento?: string | null;
  responsabilidadesFiscales?: string[];
}

export interface UpdateCustomerParams {
  id: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  municipio?: string | null;
  departamento?: string | null;
  responsabilidadesFiscales?: string[];
}

export abstract class CustomerRepository {
  abstract list(params: ListCustomersParams): Promise<Either<Failure, { data: CustomerEntity[]; pagination: PaginationMeta }>>;
  abstract findById(id: string): Promise<Either<Failure, CustomerEntity>>;
  abstract create(params: CreateCustomerParams): Promise<Either<Failure, CustomerEntity>>;
  abstract update(params: UpdateCustomerParams): Promise<Either<Failure, CustomerEntity>>;
  abstract deactivate(id: string): Promise<Either<Failure, void>>;
  abstract existsByDoc(docType: DocType, docNumber: string, excludeId?: string): Promise<Either<Failure, boolean>>;
  abstract existsByEmail(email: string, excludeId?: string): Promise<Either<Failure, boolean>>;
  abstract countActiveMonthlyPlans(customerId: string): Promise<Either<Failure, number>>;
}
