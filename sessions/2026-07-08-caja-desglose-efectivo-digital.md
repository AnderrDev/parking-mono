# Sesión: Caja — desglose efectivo/digital en cierre + historial con filtros

**Fecha:** 2026-07-08
**Subproyecto(s):** parqueadero-web, parqueadero-backend
**Estado:** completada

## Objetivos
- [x] El cierre de caja distingue efectivo (cajón) vs digital (transferencia/Nequi/Daviplata/tarjetas)
- [x] Persistir desglose por método al cierre para auditoría/historial
- [x] Modal "Resumen de cierre" antes de confirmar (estaba en spec, nunca implementado)
- [x] Historial: columna Digital, detalle expandido por método, filtros (operador + chips de rango)
- [x] UX del módulo con skills frontend-design + ui-ux-pro-max

## Avance
1. **Specs primero (SDD)**: reescritos `specs/features/cashier/close-shift.spec.md` y
   `reconcile.spec.md`; nuevo `shift-history.spec.md`. Backend:
   `specs/database-schema.spec.md` (cashier_shifts).
2. **Migración `00033_shift_method_breakdown.sql`** (aplicada a remoto con
   `supabase db push --linked`; también subió la 00032 que estaba pendiente):
   `cash_collected_cents`, `digital_collected_cents`, `digital_verified_cents`
   (NULL = no verificado, ≠ $0), `totals_by_method` jsonb + CHECK no-negativos.
3. **Dominio web**: `DIGITAL_PAYMENT_METHODS` en `payment.entity.ts`;
   `CashierShiftEntity` con desglose + getters `hasBreakdown`/`digitalDifferenceCents`;
   `CloseShiftUseCase` ahora agrupa pagos con `listByShift` (ya no `sumCashByShift`),
   valida justificación obligatoria si |dif| > $5.000 (regla de spec que NO estaba
   implementada) y persiste snapshot; `ReconcileResult` con `cashCollectedCents`/
   `digitalCollectedCents`; `CashierRepository.listOperators()` nuevo.
4. **UI caja** (`cashier-shift.page.*`): header con 3 stats (Recaudado / Efectivo
   esperado / Digital); "Cuadre actual" agrupado por canal con subtotales; cierre en
   pasos 1-efectivo 2-digital (campo opcional "Digital verificado" con diferencia en
   vivo) y botón "Revisar y cerrar caja" que abre
   `close-shift-summary-dialog.component.ts` (nuevo; errores inline, `injector` +
   `viewContainerRef` como todos los dialogs).
5. **Historial** (`shift-history.page.*`): chips Hoy/7d/30d, select de operador
   (auto-aplica), columna Digital, detalle expandido con desglose por canal +
   verificación digital + mensaje para turnos previos al desglose.
6. **Fixes de paso**: `computed` sobre FormControl.value no era reactivo → señales
   espejo vía `valueChanges`; toasts de apertura/retiro imprimían centavos como pesos;
   mocks de tests (parking/cashier/monthly-plans) sin los métodos `correct*` → ahora
   `tsc --noEmit -p tsconfig.spec.json` queda limpio.
7. Validación: `ng build` OK (solo warning preexistente de qz-tray). Tests NO
   ejecutados (regla del proyecto).

## Decisiones
- `digital_verified_cents` opcional y **NULL ≠ 0**: no verificar no bloquea el cierre
  (informativo); la diferencia digital se calcula en cliente, no se persiste.
- Turnos cerrados antes de 00033: columnas NULL → historial muestra "—", no $0.
- `listOperators()` vive en `CashierRepository` (join con `users` ya existía en
  `listShifts`); historial es admin/contador así que RLS lo permite.
- `difference_cents` sigue siendo solo efectivo (no se mezclan canales en el cuadre).

## Bloqueos / Pendientes
- MCP de Supabase sin token (`SUPABASE_ACCESS_TOKEN`); se usó CLI linked.

## Next Steps
- [ ] Probar en app real un ciclo completo: abrir caja → pagos mixtos → cierre con
      verificación digital → revisar historial (`/cashier/history`).
- [ ] Considerar imprimir el resumen de cierre en ticket térmico (ya existe
      infraestructura qz-tray en parking).
