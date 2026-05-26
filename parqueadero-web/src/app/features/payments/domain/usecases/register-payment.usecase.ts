import { Inject, Injectable } from '@angular/core';
import { UseCase } from '../../../../core/base/usecase';
import { Either, left } from '../../../../core/either/either';
import { BusinessRuleFailure, Failure, ValidationFailure } from '../../../../core/either/failures';
import {
  CASHIER_REPOSITORY_TOKEN,
  PAYMENT_REPOSITORY_TOKEN,
  GET_SETTING_TOKEN,
} from '../../../../core/di/injection-tokens';
import { PaymentEntity, PaymentMethod, FREE_PAYMENT_METHODS } from '../../../parking/domain/entities/payment.entity';
import { PaymentRepository, CreatePaymentParams } from '../repositories/payment.repository';
import { CashierRepository } from '../../../cashier/domain/repositories/cashier.repository';
import { GetSettingUseCase } from '../../../settings/domain/usecases/get-setting.usecase';
import { OperationalConfigValue } from '../../../settings/domain/entities/app-setting.entity';

export interface RegisterPaymentParams {
  cashierShiftId: string;
  method: PaymentMethod;
  amountCents: number;
  invoiceId: string | null;
  gatewayRef: string | null;
  parkingSessionId: string | null;
}

@Injectable()
export class RegisterPaymentUseCase extends UseCase<RegisterPaymentParams, PaymentEntity> {
  constructor(
    @Inject(PAYMENT_REPOSITORY_TOKEN) private readonly paymentRepo: PaymentRepository,
    @Inject(CASHIER_REPOSITORY_TOKEN) private readonly cashierRepo: CashierRepository,
    @Inject(GET_SETTING_TOKEN) private readonly getSetting: GetSettingUseCase,
  ) {
    super();
  }

  async execute(params: RegisterPaymentParams): Promise<Either<Failure, PaymentEntity>> {
    if (params.amountCents < 0) {
      return left(new ValidationFailure('El monto debe ser ≥ 0'));
    }

    const isFreeMethod = (FREE_PAYMENT_METHODS as readonly string[]).includes(params.method);
    if (isFreeMethod && params.amountCents !== 0) {
      return left(new ValidationFailure('Cortesía/error/mensual deben tener monto = 0'));
    }
    if (!isFreeMethod && params.amountCents === 0) {
      return left(new ValidationFailure('El monto debe ser mayor a 0 para este método de pago'));
    }

    const shiftResult = await this.cashierRepo.findById(params.cashierShiftId);
    if (shiftResult.isLeft()) return left(shiftResult.value);
    const shift = shiftResult.value;
    if (!shift || shift.status !== 'open') {
      return left(new BusinessRuleFailure('No hay turno abierto. Abre tu turno antes de registrar pagos.'));
    }

    const config = await this.loadOperationalConfig();

    // Validación tope efectivo en caja (HU): si entra efectivo, verificar
    // que opening + cashSum + amount no supere cash_cap_cents.
    if (params.method === 'efectivo' && config.cash_cap_cents > 0) {
      const sumResult = await this.paymentRepo.sumCashByShift(params.cashierShiftId);
      if (sumResult.isLeft()) return left(sumResult.value);
      const currentCash = shift.openingBalanceCents + (sumResult.value as number);
      if (currentCash + params.amountCents > config.cash_cap_cents) {
        return left(new BusinessRuleFailure(
          'Se superaría el tope de efectivo en caja. Haz un retiro parcial antes de cobrar.',
        ));
      }
    }

    // Validación máximo cortesías por turno: si method === 'cortesia',
    // contar cuántas cortesías ya tiene el turno.
    if (params.method === 'cortesia' && config.max_courtesies_per_shift > 0) {
      const listResult = await this.paymentRepo.listByShift(params.cashierShiftId);
      if (listResult.isLeft()) return left(listResult.value);
      const courtesyCount = listResult.value.filter(
        (p) => p.method === 'cortesia' && p.status === 'completed',
      ).length;
      if (courtesyCount >= config.max_courtesies_per_shift) {
        return left(new BusinessRuleFailure(
          `Tope de cortesías del turno alcanzado (${config.max_courtesies_per_shift}).`,
        ));
      }
    }

    const createParams: CreatePaymentParams = {
      sessionId: params.parkingSessionId,
      cashierShiftId: params.cashierShiftId,
      method: params.method,
      amountCents: params.amountCents,
      invoiceId: params.invoiceId,
      gatewayRef: params.gatewayRef,
    };

    return this.paymentRepo.create(createParams);
  }

  private async loadOperationalConfig(): Promise<OperationalConfigValue> {
    const defaults: OperationalConfigValue = {
      cash_cap_cents: 0,
      monthly_grace_days: 3,
      max_courtesies_per_shift: 0,
      admin_email: '',
      enabled_payment_methods: [],
    };
    const r = await this.getSetting.execute({ key: 'operational_config' });
    if (r.isLeft() || !r.value) return defaults;
    return { ...defaults, ...(r.value.value as OperationalConfigValue) };
  }
}
