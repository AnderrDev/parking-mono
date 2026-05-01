export interface ParkingInfoValue {
  name: string;
  nit: string;
  dv: string;
  address: string;
  municipio: string;
  departamento: string;
  phone: string;
  email: string;
}

export interface InvoicingConfigValue {
  prefix: string;
  resolution: string;
  technical_key: string;
  contingency_prefix: string;
  software_id: string;
  software_pin: string;
}

export interface OperationalConfigValue {
  cash_cap_cents: number;
  monthly_grace_days: number;
  max_courtesies_per_shift: number;
  admin_email: string;
  enabled_payment_methods: string[];
}

export type AppSettingKey = 'parking_info' | 'invoicing_config' | 'operational_config';

export type AppSettingValue =
  | ParkingInfoValue
  | InvoicingConfigValue
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
