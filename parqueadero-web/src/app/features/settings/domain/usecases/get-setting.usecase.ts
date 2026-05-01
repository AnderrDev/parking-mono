import { Inject, Injectable } from '@angular/core';
import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { UseCase } from '../../../../core/base/usecase';
import { SETTINGS_REPOSITORY_TOKEN } from '../../../../core/di/injection-tokens';
import { AppSettingEntity, AppSettingKey } from '../entities/app-setting.entity';
import { SettingsRepository } from '../repositories/settings.repository';

@Injectable()
export class GetSettingUseCase extends UseCase<{ key: AppSettingKey }, AppSettingEntity | null> {
  constructor(
    @Inject(SETTINGS_REPOSITORY_TOKEN) private readonly repo: SettingsRepository,
  ) {
    super();
  }

  async execute(params: { key: AppSettingKey }): Promise<Either<Failure, AppSettingEntity | null>> {
    return this.repo.get(params.key);
  }
}
