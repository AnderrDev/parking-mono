import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { AuditEntryEntity, AuditAction } from '../../domain/entities/audit-entry.entity';
import {
  AuditRepository,
  ListAuditParams,
  ListAuditResult,
} from '../../domain/repositories/audit.repository';

interface AuditRow {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
}

@Injectable()
export class AuditRemoteDataSource extends AuditRepository {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async list(params: ListAuditParams): Promise<Either<Failure, ListAuditResult>> {
    try {
      const offset = (params.page - 1) * params.pageSize;
      let query = this.supabase.client
        .from('v_audit_log')
        .select('*', { count: 'exact' });

      if (params.dateFrom) query = query.gte('created_at', params.dateFrom.toISOString());
      if (params.dateTo) query = query.lte('created_at', params.dateTo.toISOString());
      if (params.userId) query = query.eq('user_id', params.userId);
      if (params.action) query = query.eq('action', params.action);
      if (params.entityType) query = query.eq('entity_type', params.entityType);

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + params.pageSize - 1)
        .returns<AuditRow[]>();

      if (error) return left(new ServerFailure(error.message));

      const entries = (data ?? []).map(
        (r) =>
          new AuditEntryEntity(
            r.id,
            r.user_id,
            r.user_name ?? null,
            r.action,
            r.entity_type,
            r.entity_id,
            r.before_json,
            r.after_json,
            new Date(r.created_at),
          ),
      );

      const total = count ?? 0;
      return right({
        data: entries,
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
        },
      });
    } catch {
      return left(new NetworkFailure());
    }
  }
}
