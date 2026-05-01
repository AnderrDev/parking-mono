import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { AppSettingEntity, AppSettingKey, AppSettingValue } from '../entities/app-setting.entity';

export abstract class SettingsRepository {
  abstract get(key: AppSettingKey): Promise<Either<Failure, AppSettingEntity | null>>;
  abstract update(key: AppSettingKey, value: AppSettingValue): Promise<Either<Failure, AppSettingEntity>>;
}
