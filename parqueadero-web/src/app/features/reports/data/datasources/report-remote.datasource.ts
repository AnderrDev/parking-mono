import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import {
  RevenueDailyRow,
  SessionsByTypeRow,
  OperatorPerformanceRow,
  ExportCsvParams,
  ExportCsvResult,
} from '../../domain/repositories/report.repository';
import { ReportDataSource } from './report.datasource';

@Injectable()
export class ReportRemoteDataSource extends ReportDataSource {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async getRevenueDailyRows(
    dateFrom: Date,
    dateTo: Date,
    operatorId?: string | null,
    vehicleType?: string | null,
  ): Promise<Either<Failure, RevenueDailyRow[]>> {
    try {
      let query = this.supabase.client
        .from('v_revenue_daily')
        .select('*')
        .gte('paid_at', dateFrom.toISOString())
        .lte('paid_at', dateTo.toISOString())
        .order('paid_at', { ascending: true });

      if (operatorId) query = query.eq('operator_id', operatorId);
      // OJO al exponer este filtro en la UI: las ventas de plan tienen
      // `vehicle_type` NULL (el pago no cuelga de una sesión), así que
      // filtrar por tipo las excluye del total. Hoy ninguna pantalla lo
      // pasa; si se agrega, hay que avisarlo igual que en la tabla por tipo.
      if (vehicleType) query = query.eq('vehicle_type', vehicleType);

      const { data, error } = await query.returns<RevenueDailyRow[]>();
      if (error) return left(new ServerFailure(error.message));
      return right(data ?? []);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async getSessionsByTypeRows(
    dateFrom: Date,
    dateTo: Date,
  ): Promise<Either<Failure, SessionsByTypeRow[]>> {
    try {
      const { data, error } = await this.supabase.client
        .from('v_sessions_by_type')
        .select('*')
        .gte('entry_at', dateFrom.toISOString())
        .lte('entry_at', dateTo.toISOString())
        .order('entry_at', { ascending: true })
        .returns<SessionsByTypeRow[]>();

      if (error) return left(new ServerFailure(error.message));
      return right(data ?? []);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async getOperatorPerformanceRows(
    dateFrom: Date,
    dateTo: Date,
    operatorId?: string | null,
  ): Promise<Either<Failure, OperatorPerformanceRow[]>> {
    try {
      let query = this.supabase.client
        .from('v_operator_performance')
        .select('*')
        .gte('opened_at', dateFrom.toISOString())
        .lte('opened_at', dateTo.toISOString());

      if (operatorId) query = query.eq('operator_id', operatorId);

      const { data, error } = await query.returns<OperatorPerformanceRow[]>();
      if (error) return left(new ServerFailure(error.message));
      return right(data ?? []);
    } catch {
      return left(new NetworkFailure());
    }
  }

  async requestCsvExport(params: ExportCsvParams): Promise<Either<Failure, ExportCsvResult>> {
    try {
      const { data, error } = await this.supabase.client.functions.invoke('report-export', {
        body: {
          entity: params.entity,
          date_from: params.dateFrom.toISOString(),
          date_to: params.dateTo.toISOString(),
          ...(params.operatorId ? { operator_id: params.operatorId } : {}),
        },
      });

      if (error) return left(new ServerFailure(error.message));
      if (!data?.download_url) return left(new ServerFailure('No se recibió URL de descarga'));

      return right({
        downloadUrl: data.download_url as string,
        expiresAt: new Date(data.expires_at as string),
      });
    } catch {
      return left(new NetworkFailure());
    }
  }
}
