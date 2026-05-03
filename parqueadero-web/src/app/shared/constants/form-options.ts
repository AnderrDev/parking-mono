import { VehicleType } from '../../features/parking/domain/entities/parking-session.entity';

/** Tipos de documento aceptados para clientes (NIT requiere validador específico). */
export type DocType = 'cedula' | 'nit' | 'pasaporte';

export const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'cedula', label: 'Cédula de ciudadanía' },
  { value: 'nit', label: 'NIT' },
  { value: 'pasaporte', label: 'Pasaporte' },
];

/** Tipos de vehículo soportados (alineado con `VehicleType` del dominio). */
export const VEHICLE_TYPES: { value: VehicleType; label: string; shortLabel: string }[] = [
  { value: 'carro', label: 'Carro', shortLabel: 'Carro' },
  { value: 'moto', label: 'Moto', shortLabel: 'Moto' },
  { value: 'bicicleta', label: 'Bicicleta', shortLabel: 'Bici' },
  { value: 'otro', label: 'Otro', shortLabel: 'Otro' },
];

/** Planes mensuales — los valores deben coincidir con BD `monthly_plans.plan_type`. */
export const PLAN_TYPES = [
  { value: 'basico', label: 'Básico' },
  { value: 'premium', label: 'Premium' },
  { value: 'ilimitado', label: 'Ilimitado' },
];

/**
 * Métodos de pago disponibles para mensualidades (UI). Los valores específicos
 * de mensualidad usan etiquetas separadas del enum `PaymentMethod` del dominio
 * de parking, que solo soporta cash/card/transfer/free a nivel de tabla payments.
 */
export const PAYMENT_METHODS_PLAN = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta_credito', label: 'Tarjeta crédito' },
  { value: 'tarjeta_debito', label: 'Tarjeta débito' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'nequi', label: 'Nequi' },
  { value: 'daviplata', label: 'Daviplata' },
];

/** Unidades de tarifa — 'dia' eliminado del selector (ver tariff-edit-dialog). */
export const TARIFF_UNITS = [
  { value: 'hora', label: 'Por hora' },
  { value: 'fraccion', label: 'Por fracción (30 min)' },
  { value: 'minuto', label: 'Por minuto' },
  { value: 'mensualidad', label: 'Mensualidad (mes completo)' },
];
