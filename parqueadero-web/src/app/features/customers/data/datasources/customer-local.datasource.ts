import { Injectable, inject } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, NotFoundFailure } from '../../../../core/either/failures';
import { LocalDbService } from '../../../../core/services/local-db.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { CustomerEntity, DocType } from '../../domain/entities/customer.entity';
import {
  CreateCustomerParams,
  ListCustomersParams,
  UpdateCustomerParams,
} from '../../domain/repositories/customer.repository';
import { CustomerDataSource } from './customer.datasource';
import { CustomerMapper, CustomerModel as RemoteCustomerModel } from '../models/customer.model';

// ──────────────────────────────────────────────────────────────────────────────
// CustomerLocalDataSource — lectura desde el mirror Dexie. Sprint 1.
// El snapshot/realtime sólo trae _deleted=false y updated_at>=90d.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class CustomerLocalDataSource extends CustomerDataSource {
  private readonly localDb = inject(LocalDbService);

  async list(
    params: ListCustomersParams,
  ): Promise<Either<Failure, { data: CustomerEntity[]; pagination: PaginationMeta }>> {
    try {
      const db = this.localDb.getDB();
      let rows = await db.customers.toArray();

      // El mirror no persiste deleted; mantenemos filtro defensivo.
      rows = rows.filter((r) => r['_deleted'] !== true);

      if (params.search) {
        const needle = params.search.toLowerCase();
        rows = rows.filter((r) => {
          const name = String(r['name'] ?? '').toLowerCase();
          const doc = String(r['doc_number'] ?? '').toLowerCase();
          return name.includes(needle) || doc.includes(needle);
        });
      }

      const sortField = params.sort?.field ?? 'name';
      const sortDir = params.sort?.direction ?? 'asc';
      rows.sort((a, b) => {
        const av = a[sortField];
        const bv = b[sortField];
        if (av == null && bv == null) return 0;
        if (av == null) return sortDir === 'asc' ? -1 : 1;
        if (bv == null) return sortDir === 'asc' ? 1 : -1;
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });

      const page = params.pagination?.page ?? 1;
      const pageSize = params.pagination?.pageSize ?? 25;
      const total = rows.length;
      const slice = rows.slice((page - 1) * pageSize, page * pageSize);

      return right({
        data: slice.map((r) => CustomerMapper.toEntity(r as unknown as RemoteCustomerModel)),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (e) {
      return left(new NetworkFailure(`Error leyendo clientes locales: ${String(e)}`));
    }
  }

  async findById(id: string): Promise<Either<Failure, CustomerEntity>> {
    try {
      const row = await this.localDb.getDB().customers.get(id);
      if (!row) return left(new NotFoundFailure('Cliente no encontrado'));
      return right(CustomerMapper.toEntity(row as unknown as RemoteCustomerModel));
    } catch (e) {
      return left(new NetworkFailure(`Error leyendo cliente local: ${String(e)}`));
    }
  }

  async create(_params: CreateCustomerParams): Promise<Either<Failure, CustomerEntity>> {
    return left(new NetworkFailure('No disponible offline'));
  }

  async update(_params: UpdateCustomerParams): Promise<Either<Failure, CustomerEntity>> {
    return left(new NetworkFailure('No disponible offline'));
  }

  async deactivate(_id: string): Promise<Either<Failure, void>> {
    return left(new NetworkFailure('No disponible offline'));
  }

  async existsByDoc(
    docType: DocType,
    docNumber: string,
    excludeId?: string,
  ): Promise<Either<Failure, boolean>> {
    try {
      const rows = await this.localDb.getDB().customers.toArray();
      const hit = rows.find(
        (r) =>
          r['doc_number'] === docNumber &&
          r['doc_type'] === docType &&
          r['_deleted'] !== true &&
          (excludeId ? r.id !== excludeId : true),
      );
      return right(!!hit);
    } catch (e) {
      return left(new NetworkFailure(`Error consultando cliente local: ${String(e)}`));
    }
  }

  async existsByEmail(email: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    try {
      const rows = await this.localDb.getDB().customers.toArray();
      const hit = rows.find(
        (r) =>
          r['email'] === email &&
          r['_deleted'] !== true &&
          (excludeId ? r.id !== excludeId : true),
      );
      return right(!!hit);
    } catch (e) {
      return left(new NetworkFailure(`Error consultando cliente local: ${String(e)}`));
    }
  }

  async countActiveMonthlyPlans(customerId: string): Promise<Either<Failure, number>> {
    try {
      const rows = await this.localDb.getDB().monthly_plans.toArray();
      const count = rows.filter(
        (r) =>
          r['customer_id'] === customerId &&
          (r['status'] === 'active' || r['status'] === 'expiring'),
      ).length;
      return right(count);
    } catch (e) {
      return left(new NetworkFailure(`Error contando planes locales: ${String(e)}`));
    }
  }
}
