import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { InvoiceEntity } from '../../domain/entities/invoice.entity';
import { InvoiceDetailEntity } from '../../domain/entities/invoice-detail.entity';
import {
  InvoicingRepository,
  RequestInvoiceParams,
  ListInvoicesParams,
  ListInvoicesResult,
  ListInvoicesRow,
} from '../../domain/repositories/invoicing.repository';
import { InvoiceMapper, InvoiceModel } from '../models/invoice.model';
import { CustomerMapper, CustomerModel } from '../../../customers/data/models/customer.model';
import { PaymentMapper, PaymentModel } from '../../../parking/data/models/payment.model';
import { ParkingSessionMapper, ParkingSessionModel } from '../../../parking/data/models/parking-session.model';
import { TariffMapper, TariffModel } from '../../../parking/data/models/tariff.model';

interface InvoiceListJoinedRow extends InvoiceModel {
  parking_sessions: { vehicle_plate: string } | null;
  payments: { method: string } | null;
  customers: { name: string } | null;
}

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

  async getDetailById(invoiceId: string): Promise<Either<Failure, InvoiceDetailEntity | null>> {
    try {
      const { data, error } = await this.supabase.client
        .from('invoices')
        .select(`
          *,
          customers:customer_id (*),
          payments:payment_id (*),
          parking_sessions:session_id (*,
            tariffs:tariff_id (*)
          )
        `)
        .eq('id', invoiceId)
        .eq('_deleted', false)
        .maybeSingle<InvoiceModel & {
          customers: CustomerModel | null;
          payments: PaymentModel | null;
          parking_sessions: (ParkingSessionModel & { tariffs: TariffModel | null }) | null;
        }>();

      if (error) return left(new ServerFailure(error.message));
      if (!data) return right(null);

      const invoice = InvoiceMapper.toEntity(data);
      const customer = data.customers ? CustomerMapper.toEntity(data.customers) : null;
      const payment = data.payments ? PaymentMapper.toEntity(data.payments) : null;
      const session = data.parking_sessions ? ParkingSessionMapper.toEntity(data.parking_sessions) : null;
      const tariff = data.parking_sessions?.tariffs ? TariffMapper.toEntity(data.parking_sessions.tariffs) : null;

      return right(new InvoiceDetailEntity(invoice, payment, session, customer, tariff));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async list(params: ListInvoicesParams): Promise<Either<Failure, ListInvoicesResult>> {
    try {
      const offset = (params.page - 1) * params.pageSize;
      const plate = params.vehiclePlate?.trim().toUpperCase();

      let query = this.supabase.client
        .from('invoices')
        .select(`
          *,
          customers:customer_id (name),
          payments:payment_id (method),
          parking_sessions:session_id (vehicle_plate)
        `, { count: 'exact' })
        .eq('_deleted', false)
        .order('issued_at', { ascending: false });

      if (params.dateFrom) query = query.gte('issued_at', params.dateFrom.toISOString());
      if (params.dateTo)   query = query.lte('issued_at', params.dateTo.toISOString());
      if (params.customerId) query = query.eq('customer_id', params.customerId);
      if (params.internalNumber?.trim()) {
        query = query.ilike('internal_number', `%${params.internalNumber.trim()}%`);
      }
      if (plate) {
        query = query.eq('parking_sessions.vehicle_plate', plate);
      }
      if (params.paymentMethod) {
        query = query.eq('payments.method', params.paymentMethod);
      }

      query = query.range(offset, offset + params.pageSize - 1);

      const { data, error, count } = await query.returns<InvoiceListJoinedRow[]>();
      if (error) return left(new ServerFailure(error.message));

      const total = count ?? 0;
      const pagination: PaginationMeta = {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.ceil(total / params.pageSize),
      };

      const rows: ListInvoicesRow[] = (data ?? []).map((r) => ({
        invoice: InvoiceMapper.toEntity(r),
        vehiclePlate: r.parking_sessions?.vehicle_plate ?? null,
        customerName: r.customers?.name ?? null,
        paymentMethod: r.payments?.method ?? null,
      }));

      return right({ data: rows, pagination });
    } catch {
      return left(new NetworkFailure());
    }
  }
}
