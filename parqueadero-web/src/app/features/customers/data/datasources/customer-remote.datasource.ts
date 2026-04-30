import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, NotFoundFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { CustomerEntity, DocType } from '../../domain/entities/customer.entity';
import { CreateCustomerParams, ListCustomersParams, UpdateCustomerParams } from '../../domain/repositories/customer.repository';
import { CustomerDataSource } from './customer.datasource';
import { CustomerMapper, CustomerModel } from '../models/customer.model';

@Injectable()
export class CustomerRemoteDataSource extends CustomerDataSource {
  constructor(private readonly supabase: SupabaseService) { super(); }

  async list(params: ListCustomersParams): Promise<Either<Failure, { data: CustomerEntity[]; pagination: PaginationMeta }>> {
    try {
      const page = params.pagination?.page ?? 1;
      const pageSize = params.pagination?.pageSize ?? 25;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = this.supabase.client.from('customers').select('*', { count: 'exact' });

      if (!params.includeDeleted) query = query.eq('_deleted', false);
      if (params.search) {
        const s = `%${params.search}%`;
        query = query.or(`name.ilike.${s},doc_number.ilike.${s}`);
      }

      const sortField = params.sort?.field ?? 'name';
      const sortDir = params.sort?.direction ?? 'asc';
      query = query.order(sortField, { ascending: sortDir === 'asc' }).range(from, to);

      const { data, error, count } = await query;
      if (error) return left(new ServerFailure(error.message));

      const rows = (data ?? []) as CustomerModel[];
      const total = count ?? 0;
      return right({
        data: rows.map(CustomerMapper.toEntity),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async findById(id: string): Promise<Either<Failure, CustomerEntity>> {
    try {
      const { data, error } = await this.supabase.client
        .from('customers').select('*').eq('id', id).single();
      if (error) {
        return error.code === 'PGRST116'
          ? left(new NotFoundFailure('Cliente no encontrado'))
          : left(new ServerFailure(error.message));
      }
      return right(CustomerMapper.toEntity(data as CustomerModel));
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async create(params: CreateCustomerParams): Promise<Either<Failure, CustomerEntity>> {
    try {
      const payload: Record<string, unknown> = {
        doc_type: params.docType,
        doc_number: params.docNumber,
        name: params.name.trim(),
        responsabilidades_fiscales: params.responsabilidadesFiscales ?? ['R-99-PN'],
      };
      if (params.dv != null) payload['dv'] = params.dv;
      if (params.email != null) payload['email'] = params.email;
      if (params.phone != null) payload['phone'] = params.phone;
      if (params.address != null) payload['address'] = params.address;
      if (params.municipio != null) payload['municipio'] = params.municipio;
      if (params.departamento != null) payload['departamento'] = params.departamento;

      const { data, error } = await this.supabase.client
        .from('customers').insert(payload).select().single();
      if (error) return left(new ServerFailure(error.message));
      return right(CustomerMapper.toEntity(data as CustomerModel));
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async update(params: UpdateCustomerParams): Promise<Either<Failure, CustomerEntity>> {
    try {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (params.name !== undefined) patch['name'] = params.name.trim();
      if ('email' in params) patch['email'] = params.email ?? null;
      if ('phone' in params) patch['phone'] = params.phone ?? null;
      if ('address' in params) patch['address'] = params.address ?? null;
      if ('municipio' in params) patch['municipio'] = params.municipio ?? null;
      if ('departamento' in params) patch['departamento'] = params.departamento ?? null;
      if (params.responsabilidadesFiscales !== undefined) {
        patch['responsabilidades_fiscales'] = params.responsabilidadesFiscales;
      }

      const { data, error } = await this.supabase.client
        .from('customers').update(patch).eq('id', params.id).select().single();
      if (error) return left(new ServerFailure(error.message));
      return right(CustomerMapper.toEntity(data as CustomerModel));
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async deactivate(id: string): Promise<Either<Failure, void>> {
    try {
      const { error } = await this.supabase.client
        .from('customers').update({ _deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) return left(new ServerFailure(error.message));
      return right(undefined);
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async existsByDoc(docType: DocType, docNumber: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    try {
      let query = this.supabase.client
        .from('customers').select('id', { count: 'exact', head: true })
        .eq('doc_type', docType).eq('doc_number', docNumber).eq('_deleted', false);
      if (excludeId) query = query.neq('id', excludeId);
      const { count, error } = await query;
      if (error) return left(new ServerFailure(error.message));
      return right((count ?? 0) > 0);
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async existsByEmail(email: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    try {
      let query = this.supabase.client
        .from('customers').select('id', { count: 'exact', head: true })
        .eq('email', email).eq('_deleted', false);
      if (excludeId) query = query.neq('id', excludeId);
      const { count, error } = await query;
      if (error) return left(new ServerFailure(error.message));
      return right((count ?? 0) > 0);
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }

  async countActiveMonthlyPlans(customerId: string): Promise<Either<Failure, number>> {
    try {
      const { count, error } = await this.supabase.client
        .from('monthly_plans').select('id', { count: 'exact', head: true })
        .eq('customer_id', customerId).in('status', ['active', 'expiring']);
      if (error) return left(new ServerFailure(error.message));
      return right(count ?? 0);
    } catch {
      return left(new NetworkFailure('Sin conexión'));
    }
  }
}
