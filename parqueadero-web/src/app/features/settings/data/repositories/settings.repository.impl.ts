import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { SETTINGS_DATASOURCE_TOKEN } from '../../../../core/di/injection-tokens';
import {
  AppSettingEntity,
  AppSettingKey,
  AppSettingValue,
} from '../../domain/entities/app-setting.entity';
import { SettingsRepository } from '../../domain/repositories/settings.repository';

@Injectable()
export class SettingsRepositoryImpl extends SettingsRepository {
  constructor(
    @Inject(SETTINGS_DATASOURCE_TOKEN) private readonly ds: SettingsRepository,
  ) {
    super();
  }

  async get(key: AppSettingKey): Promise<Either<Failure, AppSettingEntity | null>> {
    return this.ds.get(key);
  }

  async update(
    key: AppSettingKey,
    value: AppSettingValue,
  ): Promise<Either<Failure, AppSettingEntity>> {
    return this.ds.update(key, value);
  }
}
