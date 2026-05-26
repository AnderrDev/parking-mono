export interface ParkingInfoValue {
  name: string;
  nit: string;
  dv: string;
  address: string;
  municipio: string;
  departamento: string;
  phone: string;
  email: string;
  // Campos agregados 2026-05-20 para el ticket impreso (HU-030 v2)
  parkingType: 'publico' | 'privado' | '';
  resolutionNumber: string;
  closingTime: string;
}

export interface OperationalConfigValue {
  cash_cap_cents: number;
  monthly_grace_days: number;
  max_courtesies_per_shift: number;
  admin_email: string;
  enabled_payment_methods: string[];
  diff_threshold_cents?: number;
  max_report_range_days?: number;
}

export type AppSettingKey = 'parking_info' | 'operational_config';

export type AppSettingValue =
  | ParkingInfoValue
  | OperationalConfigValue
  | Record<string, unknown>;

export class AppSettingEntity {
  constructor(
    public readonly key: AppSettingKey,
    public readonly value: AppSettingValue,
    public readonly description: string | null,
    public readonly updatedAt: Date,
  ) {}
}
