import { VehicleType } from '../../features/parking/domain/entities/parking-session.entity';
import { PlanTariffUnit } from '../../features/parking/domain/entities/tariff.entity';

/** Tipos de documento aceptados para clientes (NIT requiere validador específico). */
export type DocType = 'cedula' | 'nit' | 'pasaporte';

export const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'cedula', label: 'Cédula de ciudadanía' },
  { value: 'nit', label: 'NIT' },
  { value: 'pasaporte', label: 'Pasaporte' },
];

/**
 * Tipos de vehículo que se ofrecen en la UI. `bicicleta` se retiró el
 * 2026-08-11 porque el parqueadero no las recibe; el valor sigue siendo
 * válido en el dominio y en el CHECK de la BD para no romper datos viejos,
 * simplemente ya no se puede elegir.
 */
export const VEHICLE_TYPES: { value: VehicleType; label: string; shortLabel: string }[] = [
  { value: 'carro', label: 'Carro', shortLabel: 'Carro' },
  { value: 'moto', label: 'Moto', shortLabel: 'Moto' },
  { value: 'otro', label: 'Otros', shortLabel: 'Otros' },
];

/**
 * Duraciones vendibles de un plan. El valor coincide con la `unit` de la
 * tarifa que le pone precio (`tariffs.unit`), y `days` es lo que se le suma
 * a la fecha de inicio para obtener la de vencimiento.
 *
 * La duración NO se guarda en `monthly_plans`: la expresan `start_date` y
 * `end_date`. Esta lista solo alimenta la UI y el lookup de la tarifa.
 */
export const PLAN_DURATIONS: { value: PlanTariffUnit; label: string; days: number }[] = [
  { value: 'quincena', label: '15 días', days: 15 },
  { value: 'mensualidad', label: '30 días', days: 30 },
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
  { value: 'quincena', label: 'Quincena (plan de 15 días)' },
  { value: 'mensualidad', label: 'Mensualidad (plan de 30 días)' },
];
