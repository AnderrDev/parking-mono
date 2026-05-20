import { Inject, Injectable, inject } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, NetworkFailure } from '../../../../core/either/failures';
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
import { CustomerLocalDataSource } from '../datasources/customer-local.datasource';
import { NetworkInfoService } from '../../../../core/services/network-info.service';
import { LocalDbService } from '../../../../core/services/local-db.service';

// ──────────────────────────────────────────────────────────────────────────────
// CustomerRepositoryImpl — cache-aware con mirror Dexie. Sprint 1 Fase 8.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable()
export class CustomerRepositoryImpl extends CustomerRepository {
  private readonly localDs = inject(CustomerLocalDataSource);
  private readonly networkInfo = inject(NetworkInfoService);
  private readonly localDb = inject(LocalDbService);

  constructor(
    @Inject(CUSTOMER_REMOTE_DATASOURCE_TOKEN) private readonly remoteDs: CustomerDataSource,
  ) {
    super();
  }

  private writeMirror(entity: CustomerEntity): void {
    const row = {
      id: entity.id,
      doc_type: entity.docType,
      doc_number: entity.docNumber,
      dv: entity.dv,
      name: entity.name,
      email: entity.email,
      phone: entity.phone,
      address: entity.address,
      municipio: entity.municipio,
      departamento: entity.departamento,
      responsabilidades_fiscales: entity.responsabilidadesFiscales,
      created_at: entity.createdAt.toISOString(),
      updated_at: entity.updatedAt.toISOString(),
      _deleted: entity.isDeleted,
    };
    this.localDb
      .getDB()
      .customers.put(row as never)
      .catch((err) => console.warn('[CustomerRepositoryImpl] writeMirror falló', err));
  }

  async list(
    params: ListCustomersParams,
  ): Promise<Either<Failure, { data: CustomerEntity[]; pagination: PaginationMeta }>> {
    if (!this.networkInfo.isOnline()) return this.localDs.list(params);
    const remote = await this.remoteDs.list(params);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.list(params);
    }
    return remote;
  }

  async findById(id: string): Promise<Either<Failure, CustomerEntity>> {
    if (!this.networkInfo.isOnline()) return this.localDs.findById(id);
    const remote = await this.remoteDs.findById(id);
    if (remote.isRight()) {
      this.writeMirror(remote.value);
      return remote;
    }
    if (remote.value instanceof NetworkFailure) return this.localDs.findById(id);
    return remote;
  }

  async create(params: CreateCustomerParams): Promise<Either<Failure, CustomerEntity>> {
    if (!this.networkInfo.isOnline()) return left(new NetworkFailure('No disponible offline'));
    const r = await this.remoteDs.create(params);
    if (r.isRight()) this.writeMirror(r.value);
    return r;
  }

  async update(params: UpdateCustomerParams): Promise<Either<Failure, CustomerEntity>> {
    if (!this.networkInfo.isOnline()) return left(new NetworkFailure('No disponible offline'));
    const r = await this.remoteDs.update(params);
    if (r.isRight()) this.writeMirror(r.value);
    return r;
  }

  async deactivate(id: string): Promise<Either<Failure, void>> {
    if (!this.networkInfo.isOnline()) return left(new NetworkFailure('No disponible offline'));
    const r = await this.remoteDs.deactivate(id);
    if (r.isRight()) {
      this.localDb
        .getDB()
        .customers.delete(id)
        .catch((err) => console.warn('[CustomerRepositoryImpl] mirror delete falló', err));
    }
    return r;
  }

  async existsByDoc(docType: DocType, docNumber: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    if (!this.networkInfo.isOnline()) return this.localDs.existsByDoc(docType, docNumber, excludeId);
    const remote = await this.remoteDs.existsByDoc(docType, docNumber, excludeId);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.existsByDoc(docType, docNumber, excludeId);
    }
    return remote;
  }

  async existsByEmail(email: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    if (!this.networkInfo.isOnline()) return this.localDs.existsByEmail(email, excludeId);
    const remote = await this.remoteDs.existsByEmail(email, excludeId);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.existsByEmail(email, excludeId);
    }
    return remote;
  }

  async countActiveMonthlyPlans(customerId: string): Promise<Either<Failure, number>> {
    if (!this.networkInfo.isOnline()) return this.localDs.countActiveMonthlyPlans(customerId);
    const remote = await this.remoteDs.countActiveMonthlyPlans(customerId);
    if (remote.isLeft() && remote.value instanceof NetworkFailure) {
      return this.localDs.countActiveMonthlyPlans(customerId);
    }
    return remote;
  }
}
