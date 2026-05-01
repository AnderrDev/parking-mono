import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NotFoundFailure, ServerFailure } from '../../../../core/either/failures';
import { PowerSyncService } from '../../../../core/services/powersync.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { CustomerEntity, DocType } from '../../domain/entities/customer.entity';
import { CreateCustomerParams, ListCustomersParams, UpdateCustomerParams } from '../../domain/repositories/customer.repository';
import { CustomerDataSource } from './customer.datasource';
import { CustomerMapper, CustomerModel } from '../models/customer.model';

interface CustomerSqlRow extends Omit<CustomerModel, '_deleted' | 'responsabilidades_fiscales'> {
  _deleted: number;
}

function rowToModel(r: CustomerSqlRow): CustomerModel {
  return { ...r, _deleted: Boolean(r._deleted), responsabilidades_fiscales: ['R-99-PN'] };
}

@Injectable()
export class CustomerLocalDataSource extends CustomerDataSource {
  private get db() { return this.ps.db; }

  constructor(private readonly ps: PowerSyncService) { super(); }

  async list(params: ListCustomersParams): Promise<Either<Failure, { data: CustomerEntity[]; pagination: PaginationMeta }>> {
    try {
      const page = params.pagination?.page ?? 1;
      const pageSize = params.pagination?.pageSize ?? 25;
      const conditions: string[] = [];
      const bindings: unknown[] = [];

      if (!params.includeDeleted) conditions.push('(_deleted IS NULL OR _deleted = 0)');
      if (params.search) {
        conditions.push('(name LIKE ? OR doc_number LIKE ? OR email LIKE ?)');
        bindings.push(`%${params.search}%`, `%${params.search}%`, `%${params.search}%`);
      }

      const where = conditions.length ? conditions.join(' AND ') : '1=1';
      const offset = (page - 1) * pageSize;

      const count = await this.db.getAll<{ total: number }>(
        `SELECT COUNT(*) as total FROM customers WHERE ${where}`, bindings,
      );
      const total = count[0]?.total ?? 0;

      const rows = await this.db.getAll<CustomerSqlRow>(
        `SELECT * FROM customers WHERE ${where} ORDER BY name ASC LIMIT ? OFFSET ?`,
        [...bindings, pageSize, offset],
      );

      return right({
        data: rows.map((r) => CustomerMapper.toEntity(rowToModel(r))),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
      });
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async findById(id: string): Promise<Either<Failure, CustomerEntity>> {
    try {
      const rows = await this.db.getAll<CustomerSqlRow>(
        `SELECT * FROM customers WHERE id = ? LIMIT 1`, [id],
      );
      if (!rows[0]) return left(new NotFoundFailure('Cliente no encontrado', 'customer'));
      return right(CustomerMapper.toEntity(rowToModel(rows[0])));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async create(params: CreateCustomerParams): Promise<Either<Failure, CustomerEntity>> {
    try {
      const id = crypto.randomUUID();
      const ts = new Date().toISOString();
      await this.db.execute(
        `INSERT INTO customers
          (id, doc_type, doc_number, dv, name, email, phone,
           address, municipio, departamento, _deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          id, params.docType, params.docNumber, params.dv ?? null,
          params.name, params.email ?? null, params.phone ?? null,
          params.address ?? null, params.municipio ?? null, params.departamento ?? null,
          ts, ts,
        ],
      );
      const rows = await this.db.getAll<CustomerSqlRow>('SELECT * FROM customers WHERE id = ?', [id]);
      if (!rows[0]) return left(new ServerFailure('Cliente no encontrado tras insertar'));
      return right(CustomerMapper.toEntity(rowToModel(rows[0])));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async update(params: UpdateCustomerParams): Promise<Either<Failure, CustomerEntity>> {
    try {
      const ts = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const vals: unknown[] = [ts];
      if (params.name !== undefined) { sets.push('name = ?'); vals.push(params.name); }
      if (params.email !== undefined) { sets.push('email = ?'); vals.push(params.email); }
      if (params.phone !== undefined) { sets.push('phone = ?'); vals.push(params.phone); }
      if (params.address !== undefined) { sets.push('address = ?'); vals.push(params.address); }
      if (params.municipio !== undefined) { sets.push('municipio = ?'); vals.push(params.municipio); }
      if (params.departamento !== undefined) { sets.push('departamento = ?'); vals.push(params.departamento); }
      vals.push(params.id);
      await this.db.execute(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`, vals);
      const rows = await this.db.getAll<CustomerSqlRow>('SELECT * FROM customers WHERE id = ?', [params.id]);
      if (!rows[0]) return left(new NotFoundFailure('Cliente no encontrado', 'customer'));
      return right(CustomerMapper.toEntity(rowToModel(rows[0])));
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async deactivate(id: string): Promise<Either<Failure, void>> {
    try {
      await this.db.execute(
        `UPDATE customers SET _deleted = 1, updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), id],
      );
      return right(undefined);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async existsByDoc(docType: DocType, docNumber: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    try {
      let sql = `SELECT COUNT(*) as c FROM customers
                 WHERE doc_type = ? AND doc_number = ? AND (_deleted IS NULL OR _deleted = 0)`;
      const bindings: unknown[] = [docType, docNumber];
      if (excludeId) { sql += ' AND id != ?'; bindings.push(excludeId); }
      const rows = await this.db.getAll<{ c: number }>(sql, bindings);
      return right((rows[0]?.c ?? 0) > 0);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async existsByEmail(email: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    try {
      let sql = `SELECT COUNT(*) as c FROM customers
                 WHERE email = ? AND (_deleted IS NULL OR _deleted = 0)`;
      const bindings: unknown[] = [email];
      if (excludeId) { sql += ' AND id != ?'; bindings.push(excludeId); }
      const rows = await this.db.getAll<{ c: number }>(sql, bindings);
      return right((rows[0]?.c ?? 0) > 0);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }

  async countActiveMonthlyPlans(customerId: string): Promise<Either<Failure, number>> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await this.db.getAll<{ c: number }>(
        `SELECT COUNT(*) as c FROM monthly_plans
         WHERE customer_id = ? AND status IN ('active', 'expiring') AND end_date >= ?
         AND (_deleted IS NULL OR _deleted = 0)`,
        [customerId, today],
      );
      return right(rows[0]?.c ?? 0);
    } catch (err) {
      return left(new ServerFailure(String(err)));
    }
  }
}
