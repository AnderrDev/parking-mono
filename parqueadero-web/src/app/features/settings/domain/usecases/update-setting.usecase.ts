import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { SETTINGS_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import {
  AppSettingEntity,
  AppSettingKey,
  AppSettingValue,
} from '../entities/app-setting.entity';
import { SettingsRepository } from '../repositories/settings.repository';

export interface UpdateSettingParams {
  key: AppSettingKey;
  value: AppSettingValue;
}

@Injectable()
export class UpdateSettingUseCase extends UseCase<UpdateSettingParams, AppSettingEntity> {
  constructor(
    @Inject(SETTINGS_REPOSITORY_TOKEN) private readonly repo: SettingsRepository,
  ) {
    super();
  }

  async execute(params: UpdateSettingParams): Promise<Either<Failure, AppSettingEntity>> {
    return this.repo.update(params.key, params.value);
  }
}
