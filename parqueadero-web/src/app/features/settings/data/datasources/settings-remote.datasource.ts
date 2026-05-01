import { Injectable } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure, ServerFailure } from '../../../../core/either/failures';
import { SupabaseService } from '../../../../core/services/supabase.service';
import {
  AppSettingEntity,
  AppSettingKey,
  AppSettingValue,
} from '../../domain/entities/app-setting.entity';
import { SettingsRepository } from '../../domain/repositories/settings.repository';

interface SettingRow {
  key: string;
  value: AppSettingValue;
  description: string | null;
  updated_at: string;
}

@Injectable()
export class SettingsRemoteDataSource extends SettingsRepository {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async get(key: AppSettingKey): Promise<Either<Failure, AppSettingEntity | null>> {
    try {
      const { data, error } = await this.supabase.client
        .from('app_settings')
        .select()
        .eq('key', key)
        .maybeSingle<SettingRow>();

      if (error) return left(new ServerFailure(error.message));
      if (!data) return right(null);
      return right(this.mapRow(data));
    } catch {
      return left(new NetworkFailure());
    }
  }

  async update(
    key: AppSettingKey,
    value: AppSettingValue,
  ): Promise<Either<Failure, AppSettingEntity>> {
    try {
      const { data, error } = await this.supabase.client
        .from('app_settings')
        .update({
          value,
          updated_at: new Date().toISOString(),
        })
        .eq('key', key)
        .select()
        .single<SettingRow>();

      if (error) return left(new ServerFailure(error.message));
      if (!data) return left(new ServerFailure('No se recibió data tras update'));
      return right(this.mapRow(data));
    } catch {
      return left(new NetworkFailure());
    }
  }

  private mapRow(row: SettingRow): AppSettingEntity {
    return new AppSettingEntity(
      row.key as AppSettingKey,
      row.value,
      row.description,
      new Date(row.updated_at),
    );
  }
}
