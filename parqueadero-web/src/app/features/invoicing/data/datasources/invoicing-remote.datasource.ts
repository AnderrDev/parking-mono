import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { InvoiceEntity } from '../../domain/entities/invoice.entity';
import {
  InvoicingRepository,
  RequestInvoiceParams,
  ListInvoicesParams,
  ListInvoicesResult,
} from '../../domain/repositories/invoicing.repository';
import { InvoiceMapper, InvoiceModel } from '../models/invoice.model';

@Injectable()
export class InvoicingRemoteDataSource extends InvoicingRepository {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async requestInvoice(params: RequestInvoiceParams): Promise<Either<Failure, InvoiceEntity>> {
    try {
      const { data, error } = await this.supabase.client.functions.invoke('request-invoice', {
        body: {
          session_id: params.sessionId,
          customer_id: params.customerId,
          ...(params.notes ? { notes: params.notes } : {}),
        },
      });

      if (error) return left(new ServerFailure(error.message));
      if (data?.error) return left(new ServerFailure(data.error as string));
      if (!data) return left(new ServerFailure('No se recibió respuesta del servidor'));

      return right(InvoiceMapper.toEntity(data as InvoiceModel));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async reissueInvoice(invoiceId: string): Promise<Either<Failure, InvoiceEntity>> {
    try {
      const { data, error } = await this.supabase.client.functions.invoke('request-invoice', {
        body: { reissue: true, invoice_id: invoiceId, session_id: '', customer_id: '' },
      });

      if (error) return left(new ServerFailure(error.message));
      if (data?.error) return left(new ServerFailure(data.error as string));
      if (!data) return left(new ServerFailure('No se recibió respuesta del servidor'));

      return right(InvoiceMapper.toEntity(data as InvoiceModel));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async getById(invoiceId: string): Promise<Either<Failure, InvoiceEntity | null>> {
    try {
      const { data, error } = await this.supabase.client
        .from('invoices')
        .select()
        .eq('id', invoiceId)
        .eq('_deleted', false)
        .maybeSingle<InvoiceModel>();

      if (error) return left(new ServerFailure(error.message));
      return right(data ? InvoiceMapper.toEntity(data) : null);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async list(params: ListInvoicesParams): Promise<Either<Failure, ListInvoicesResult>> {
    try {
      const offset = (params.page - 1) * params.pageSize;

      let query = this.supabase.client
        .from('invoices')
        .select('*', { count: 'exact' })
        .eq('_deleted', false)
        .order('issued_at', { ascending: false });

      if (params.dateFrom) query = query.gte('issued_at', params.dateFrom.toISOString());
      if (params.dateTo)   query = query.lte('issued_at', params.dateTo.toISOString());
      if (params.dianStatus) query = query.eq('dian_status', params.dianStatus);
      if (params.customerId) query = query.eq('customer_id', params.customerId);

      query = query.range(offset, offset + params.pageSize - 1);

      const { data, error, count } = await query.returns<InvoiceModel[]>();
      if (error) return left(new ServerFailure(error.message));

      const total = count ?? 0;
      const pagination: PaginationMeta = {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.ceil(total / params.pageSize),
      };

      return right({ data: (data ?? []).map(InvoiceMapper.toEntity), pagination });
    } catch {
      return left(new NetworkFailure());
    }
  }
}
