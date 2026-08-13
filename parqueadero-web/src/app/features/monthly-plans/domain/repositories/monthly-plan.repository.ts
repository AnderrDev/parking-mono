import { Either } from '../../../../core/either/either';
import { Failure } from '../../../../core/either/failures';
import { PaginationMeta } from '../../../../shared/models/pagination.model';
import { SortParams } from '../../../../shared/models/sort.model';
import { MonthlyPlanEntity, MonthlyPlanStatus } from '../../../parking/domain/entities/monthly-plan.entity';
import { PaymentMethod } from '../../../parking/domain/entities/payment.entity';

export interface ListMonthlyPlansParams {
  search?: string | null;
  status?: MonthlyPlanStatus | null;
  customerId?: string | null;
  pagination?: { page: number; pageSize: number };
  sort?: SortParams;
}

export interface CreateMonthlyPlanParams {
  vehiclePlate: string;
  customerId: string;
  planType: string;
  startDate: Date;
  endDate: Date;
  amountCents: number;
  /**
   * Método de pago con que el cliente pagó la mensualidad. El use case
   * registra un row en `payments` ligado al `cashier_shift_id` activo
   * del usuario, para que el cuadre del turno refleje la venta.
   */
  paymentMethod: PaymentMethod;
  /** UUID del usuario que crea el plan; resuelve el shift activo. */
  userId: string;
}

/**
 * Qué pasó con la plata al cancelar. `paymentKeptClosedShift` significa que
 * el ingreso NO se anuló porque su turno ya está cerrado: el cuadre de ese
 * día ya se firmó y la devolución se maneja aparte.
 */
export interface CancelPlanOutcome {
  paymentRefunded: boolean;
  paymentKeptClosedShift: boolean;
}

export interface UpdateMonthlyPlanParams {
  id: string;
  endDate?: Date;
  amountCents?: number;
}

export abstract class MonthlyPlanRepository {
  abstract list(params: ListMonthlyPlansParams): Promise<Either<Failure, { data: MonthlyPlanEntity[]; pagination: PaginationMeta }>>;
  abstract findById(id: string): Promise<Either<Failure, MonthlyPlanEntity>>;
  /**
   * Vende la mensualidad: crea el plan y registra su ingreso en la caja
   * del turno indicado, en una sola transacción del servidor. No existe
   * una variante que solo cree el plan: separarlos fue lo que permitió que
   * un plan quedara vendido sin que la plata entrara a caja.
   */
  abstract createWithPayment(
    params: CreateMonthlyPlanParams,
    shiftId: string,
  ): Promise<Either<Failure, MonthlyPlanEntity>>;
  abstract update(params: UpdateMonthlyPlanParams): Promise<Either<Failure, MonthlyPlanEntity>>;
  abstract cancel(id: string): Promise<Either<Failure, CancelPlanOutcome>>;
  /**
   * ¿La placa ya tiene una mensualidad vigente que choque? Con `range` la
   * pregunta es por SOLAPAMIENTO con esas fechas — que es lo que castiga la
   * constraint `monthly_plans_no_overlap`. Sin `range` cae al "¿tiene algún
   * plan vigente hoy?", que sirve para consultas pero NO para validar una
   * venta: rechazaría una renovación consecutiva o una retrodatada que no
   * se solapa con nada.
   */
  abstract hasActivePlanForPlate(
    plate: string,
    range?: { start: Date; end: Date },
    excludeId?: string,
  ): Promise<Either<Failure, boolean>>;
}
