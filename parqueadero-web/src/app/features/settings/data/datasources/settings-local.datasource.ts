import { Injectable, inject } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure } from '../../../../core/either/failures';
import { LocalDbService } from '../../../../core/services/local-db.service';
import {
  AppSettingEntity,
  AppSettingKey,
  AppSettingValue,
} from '../../domain/entities/app-setting.entity';
import { SettingsRepository } from '../../domain/repositories/settings.repository';

// ──────────────────────────────────────────────────────────────────────────────
// SettingsLocalDataSource — patrón atípico: el repositorio Settings y su
// datasource comparten la misma clase abstracta (SettingsRepository), así
// que el Local también la extiende. Sprint 1 Fase 8.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class SettingsLocalDataSource extends SettingsRepository {
  private readonly localDb = inject(LocalDbService);

  async get(key: AppSettingKey): Promise<Either<Failure, AppSettingEntity | null>> {
    try {
      const row = await this.localDb.getDB().app_settings.get(key);
      if (!row) return right(null);
      const r = row as unknown as Record<string, unknown>;
      const updatedAtRaw = r['updated_at'];
      const updatedAt = typeof updatedAtRaw === 'string' ? new Date(updatedAtRaw) : new Date();
      return right(
        new AppSettingEntity(
          r['key'] as AppSettingKey,
          r['value'] as AppSettingValue,
          (r['description'] as string | null) ?? null,
          updatedAt,
        ),
      );
    } catch (e) {
      return left(new NetworkFailure(`Error leyendo setting local: ${String(e)}`));
    }
  }

  async update(_key: AppSettingKey, _value: AppSettingValue): Promise<Either<Failure, AppSettingEntity>> {
    return left(new NetworkFailure('No disponible offline'));
  }
}
