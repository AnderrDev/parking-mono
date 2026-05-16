import { Inject, Injectable, inject } from '@angular/core';
import { Either, left } from '../../../../core/either/either';
import { Failure, NetworkFailure } from '../../../../core/either/failures';
import { SETTINGS_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import {
  AppSettingEntity,
  AppSettingKey,
  AppSettingValue,
} from '../../domain/entities/app-setting.entity';
import { SettingsRepository } from '../../domain/repositories/settings.repository';
import { SettingsLocalDataSource } from '../datasources/settings-local.datasource';
import { NetworkInfoService } from '../../../../core/services/network-info.service';
import { LocalDbService } from '../../../../core/services/local-db.service';

// ──────────────────────────────────────────────────────────────────────────────
// SettingsRepositoryImpl — cache-aware con mirror Dexie. Sprint 1 Fase 8.
// `update` requiere conectividad; `get` cae al local en NetworkFailure.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable()
export class SettingsRepositoryImpl extends SettingsRepository {
  private readonly localDs = inject(SettingsLocalDataSource);
  private readonly networkInfo = inject(NetworkInfoService);
  private readonly localDb = inject(LocalDbService);

  constructor(
    @Inject(SETTINGS_DATASOURCE_TOKEN) private readonly ds: SettingsRepository,
  ) {
    super();
  }

  private writeMirror(entity: AppSettingEntity): void {
    const row = {
      key: entity.key,
      value: entity.value,
      description: entity.description,
      updated_at: entity.updatedAt.toISOString(),
    };
    this.localDb
      .getDB()
      .app_settings.put(row as never)
      .catch((err) => console.warn('[SettingsRepositoryImpl] writeMirror falló', err));
  }

  async get(key: AppSettingKey): Promise<Either<Failure, AppSettingEntity | null>> {
    if (!this.networkInfo.isOnline()) return this.localDs.get(key);
    const remote = await this.ds.get(key);
    if (remote.isRight()) {
      if (remote.value) this.writeMirror(remote.value);
      return remote;
    }
    if (remote.value instanceof NetworkFailure) return this.localDs.get(key);
    return remote;
  }

  async update(
    key: AppSettingKey,
    value: AppSettingValue,
  ): Promise<Either<Failure, AppSettingEntity>> {
    if (!this.networkInfo.isOnline()) return left(new NetworkFailure('No disponible offline'));
    const r = await this.ds.update(key, value);
    if (r.isRight()) this.writeMirror(r.value);
    return r;
  }
}
