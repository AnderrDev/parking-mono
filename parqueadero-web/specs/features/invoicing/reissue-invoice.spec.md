# Spec: Reemitir Factura (Reintentar)

## Identificador
`invoicing/reissue-invoice`

> **Actualizado en Fase 11 / S1**: con Siigo, una factura `Stamped` NO se reintenta — para anular se emite **nota crédito** (follow-up `siigo-emit-credit-note`). Este UseCase aplica solo a facturas en estado `Rejected` o `error_max_retries`.

## Descripción
UseCase que reintenta la emisión de una factura **fallida** (`siigo_status IN ('Rejected', 'error_max_retries')`). Crea una nueva invocación a `siigo-emit-invoice` reusando el `customer_id` y `session_id` de la factura origen, pero **no** reusa el `internal_number` de la rechazada — la EF asigna uno nuevo (la rechazada queda como histórico).

## Actor
Admin, Contador.

## Pre-condiciones
- Usuario autenticado con rol `admin` o `contador`.
- La factura existe y tiene `siigoStatus IN ('Rejected', 'error_max_retries')`.
- La sesión origen sigue existiendo y `payment` también.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| invoiceId | string (UUID) | Sí | Factura existente y en estado fallido |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<InvoiceEntity>` | **Nueva** factura emitida (reemplaza la rechazada en términos de UX, no de BD) |
| No encontrada | `Left<NotFoundFailure>` | Factura no existe |
| Estado inválido | `Left<BusinessRuleFailure>` | Factura `Stamped` o estado intermedio (no se puede reemitir; usar nota crédito si necesario) |
| Cliente incompleto | `Left<ValidationFailure>` | Datos fiscales del cliente cambiaron y faltan |
| Error servidor | `Left<ServerFailure>` | EF falló |

## Reglas de Negocio

1. Solo facturas con `siigoStatus IN ('Rejected', 'error_max_retries')` pueden reemitirse.
2. La factura origen (rechazada) se **conserva** en BD con su estado actual; sirve como evidencia y queda en histórico. NO se borra ni edita.
3. Se crea una **nueva** invoice con su propio `internal_number` (siguiente `nextval_invoices()`).
4. Si Siigo vuelve a rechazar: la nueva invoice queda con `siigoStatus='Rejected'`. El operador puede reintentar de nuevo (cadena de invoices rechazadas).
5. **NO aplica a `Stamped`**: una factura ya estampada en DIAN no se reintenta. Se emite nota crédito (fuera de Fase 11).
6. **Errores de validación corregibles**: si el operador ya corrigió datos del cliente entre el rechazo original y el reintento, el reintento usa los datos actuales.

## Flujo Principal

1. UseCase recibe `invoiceId`.
2. `InvoicingRepository.getById(invoiceId)` → carga factura origen.
3. Validar `canReissue` (`Rejected` o `error_max_retries`). Si no → `BusinessRuleFailure`.
4. Validar que cliente sigue teniendo datos fiscales completos. Si no → `ValidationFailure` (UI puede ofrecer pantalla de edición de cliente y reintentar después).
5. Llamar `RequestInvoiceUseCase.execute({ sessionId: origen.sessionId, customerId: origen.customerId, notes: 'Reintento de #{origen.internalNumber}' })`.
6. Retornar el resultado (la nueva entidad).

## Implementación

```typescript
@Injectable({ providedIn: 'any' })
export class ReissueInvoiceUseCase extends UseCase<ReissueInvoiceParams, InvoiceEntity> {
  constructor(
    @Inject(INVOICING_REPOSITORY_TOKEN) private repo: InvoicingRepository,
    private requestInvoice: RequestInvoiceUseCase,
  ) { super(); }

  async execute({ invoiceId }: ReissueInvoiceParams): Promise<Either<Failure, InvoiceEntity>> {
    const originRes = await this.repo.getById(invoiceId);
    if (originRes.isLeft()) return originRes;

    const origin = originRes.value;
    if (!origin.canReissue) {
      return Left(new BusinessRuleFailure(
        origin.isStamped
          ? 'Esta factura ya fue estampada por DIAN. Para anularla debe emitirse nota crédito.'
          : 'Esta factura no puede reintentarse en su estado actual.'
      ));
    }
    if (!origin.sessionId) {
      return Left(new BusinessRuleFailure('La factura origen no tiene sesión asociada.'));
    }

    return this.requestInvoice.execute({
      sessionId: origin.sessionId,
      customerId: origin.customerId,
      notes: `Reintento de ${origin.internalNumber}`,
    });
  }
}
```

## Dependencias

- `InvoicingRepository.getById(invoiceId)`
- `RequestInvoiceUseCase` (ver `request-invoice.spec.md`)

## Mapping a UI

- **Invocación**: `InvoicesListPage` o detalle de factura → botón "Reintentar" visible solo si `canReissue` (`Rejected` o `error_max_retries`) y rol `admin`/`contador`.
- **Confirmación**: modal "¿Reintentar emisión?" con resumen de la factura origen y opción de cancelar.
- **Feedback**: toast con resultado de la nueva emisión (mismos mensajes que `request-invoice`).
- **Fila origen**: marcada visualmente como "Reemitida — ver #{nuevoInternalNumber}" para trazabilidad. Esto requiere o (a) un campo `replacedByInvoiceId` en BD (follow-up) o (b) una vista UI que cruce por `sessionId` (más simple — la lista por sesión muestra todas las invoices, ordenadas por created_at).

## Cambios respecto a la versión Fase 9

| Antes (Fase 9) | Ahora (Fase 11) |
|---|---|
| Reusaba el mismo `number` y hacía UPDATE | Crea nueva invoice con nuevo `internal_number` |
| Aplicaba a `contingency` y `rejected` | Aplica a `Rejected` y `error_max_retries` |
| EF `request-invoice` con flag `reissue=true` | EF `siigo-emit-invoice` (sin flag — es nueva emisión) |
| Anulación = reissue | Anulación de `Stamped` = nota crédito (out of scope Fase 11) |

## Out of scope (follow-ups)

- **Notas crédito** (`siigo-emit-credit-note`): para anular facturas `Stamped`. Mientras tanto, el botón "Reintentar" no aparece en facturas `Stamped`.
- **Trazabilidad bidireccional rechazada→nueva** vía columna `replaced_by_invoice_id`: hoy se infiere por `session_id` compartido.
- **Edición de cliente desde el flujo de reintento**: si los datos fiscales del cliente cambiaron, el cajero debe ir a pantalla de edición y volver. Follow-up: integrar el sub-form fiscal de `cashier-fiscal-data-capture` en el modal de reintento.
