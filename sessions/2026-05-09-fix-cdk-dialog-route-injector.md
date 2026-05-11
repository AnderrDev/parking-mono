# Sesión: Fix CDK Dialog — DI route-scoped en todos los modales

**Fecha:** 2026-05-09
**Subproyecto(s):** parqueadero-web
**Estado:** completada

## Objetivos
- [x] Reproducir y corregir `NullInjectorError: No provider for InjectionToken RegisterVehicleEntryUseCase` al abrir el modal de ingreso.
- [x] Auditar TODOS los `dialog.open()` del proyecto para erradicar la clase entera del bug, no solo el síntoma puntual.
- [x] Auto-imprimir el comprobante de salida (HU-031 v1.1) y auto-cerrar el popup tras `window.print()`, igual que el ticket de entrada.
- [x] Filtrar el autocomplete del buscador de placas en la vista del operador a solo placas con sesión activa.
- [x] Dossier histórico por placa (HU-046): métricas acumuladas (visitas, total pagado, tiempo, último visit, últimos 30 días) + tabla de últimas N sesiones, inline en el panel del buscador del operador.

## Avance
**Iteración 1 (incompleta):** se aplicó `viewContainerRef: this.vcr` a todos los `dialog.open()` siguiendo el patrón documentado en `monthly-plans-list.page.ts:91`. El error persistió.

**Iteración 2 (la correcta, verificada contra CDK):** se leyó el código real de CDK Dialog en `node_modules/@angular/cdk/fesm2022/dialog.mjs:594`:
```js
const userInjector = config.injector || config.viewContainerRef?.injector;
```
`viewContainerRef.injector` es el **ElementInjector**, NO el `EnvironmentInjector` del route. Por eso pasarlo solo no es suficiente para resolver tokens route-scoped (`REGISTER_VEHICLE_ENTRY_TOKEN`, `TICKET_RENDERER_TOKEN`). El comentario antiguo en monthly-plans estaba mal: ese dialog funcionaba porque el componente del dialog declaraba sus propios providers en `@Component`, no por el `vcr`.

**Fix correcto (parte 1):** además de `viewContainerRef`, inyectar `EnvironmentInjector` y pasar `injector: this.envInjector` al `dialog.open()`. Aplicado uniformemente en:

- `parking/presentation/pages/operator-dashboard.page.ts` — bug original; modal de ingreso + diálogo de salida.
- `parking/presentation/pages/session-history.page.ts` — `CancelSessionDialogComponent`.
- `customers/presentation/pages/customers-list.page.ts` — 3 dialogs.
- `tariffs/presentation/pages/tariffs-list.page.ts` — 3 dialogs.
- `vehicles/presentation/pages/vehicles-list.page.ts` — 3 dialogs.
- `users/presentation/pages/users-list.page.ts` — 1 dialog.
- `cashier/presentation/pages/cashier-shift.page.ts` — `CashWithdrawalDialogComponent`.
- `monthly-plans/presentation/pages/monthly-plans-list.page.ts` — los 2 `ConfirmDialog` que aún no lo pasaban.

**Iteración 3 (segundo bug emergente):** tras el fix de iteración 2, reapareció otro `NullInjectorError` con stack `_PrintEntryTicketUseCase -> ... -> InjectionToken TicketRendererPort`. Causa: el use case estaba `@Injectable({ providedIn: 'root' })` pero su constructor inyecta `TICKET_RENDERER_TOKEN`, que es route-scoped. Al ser root-scoped, Angular intenta instanciarlo en el root injector — donde el token NO existe. **Fix:** quitar `providedIn: 'root'` del use case (queda solo `@Injectable()`) y registrarlo en `parking.routes.ts` junto a `TICKET_RENDERER_TOKEN`. Como el modal abre con `injector: this.envInjector` (route), ambos resuelven correctamente.

Archivos: `parking/domain/usecases/print-entry-ticket.usecase.ts`, `parking/parking.routes.ts`.

**Iteración 4 (UX al registrar salida):**
- **Auto-impresión del comprobante de salida (HU-031 v1.1).** En `onExitSubmit` se dispara `printReceipt(receipt)` automáticamente tras éxito; el popup ahora se autocierra ~1 s después de `window.print()` (mismo patrón que `TicketRendererService` para entrada). Si el popup está bloqueado, un toast informa y la tarjeta `<app-receipt-card>` queda con su botón "Imprimir comprobante" como fallback manual. Spec actualizada (`specs/features/parking/print-exit-receipt.spec.md` v1.1).
- **Buscador de placas: solo activas en parqueadero.** `SearchPlateSuggestionsUseCase` recibe nuevo parámetro opcional `onlyActive: boolean`. Cuando es `true` (vista del operador), el datasource consulta `parking_sessions WHERE status='active'` y deriva `VehicleEntity` sintéticos; cuando es `false` (admin/historial), conserva el comportamiento previo contra `vehicles`. La regla "1 sesión activa por placa" garantiza que no haya duplicados. Spec actualizada (`specs/features/parking/search-vehicle-by-plate.spec.md`).

Archivos: `domain/repositories/parking.repository.ts`, `data/repositories/parking.repository.impl.ts`, `data/datasources/parking.datasource.ts`, `data/datasources/parking-remote.datasource.ts`, `domain/usecases/search-plate-suggestions.usecase.ts`, `presentation/pages/operator-dashboard.page.ts`.

**Iteración 5 (HU-046 dossier histórico):**
- Spec nueva `specs/features/parking/get-vehicle-history-stats.spec.md`.
- Entidad `domain/entities/vehicle-history-stats.entity.ts` con métricas acumuladas (visitas, pagado total, tiempo, promedios, primera/última visita, ventana de 30 días, últimas N sesiones).
- Use case `domain/usecases/get-vehicle-history-stats.usecase.ts` con validación de placa y delegación al repo.
- Token DI `GET_VEHICLE_HISTORY_STATS_TOKEN` registrado route-scoped en `parking.routes.ts`.
- Datasource: implementación cliente-side (trae sesiones cerradas y agrega en JS — aceptable por volúmenes reales por placa; se documenta el camino de migración a RPC si crece).
- Componente `<app-vehicle-history-panel>` (template + scss) con grid de 4 métricas + tabla de últimas visitas + estados loading/empty/error.
- `operator-dashboard.page.ts`: signals `vehicleHistoryStats / loading / error`, `loadVehicleHistory(plate)` corre en paralelo a `searchByPlate` al seleccionar sugerencia, se limpia con `clearPlateSearch`. Template inserta el panel debajo del resultado existente.

`ng build --configuration=development` ✅ sin errores.

## Decisiones
- **Aplicar el fix a TODOS los `dialog.open()`** aunque la mayoría inyecten solo servicios `providedIn: 'root'`. Razón: la única diferencia en el bug es si algún token deja de ser root-scoped en el futuro; ahogar la clase completa cuesta poco y quita la trampa para versiones siguientes.
- **No introducir helper compartido** (e.g. `openDialogScoped()`). El proyecto prefiere repetición legible sobre abstracción prematura.
- **Ir contra el comentario previo en monthly-plans.** El comentario decía que `viewContainerRef` era la forma fiable; verificando en `dialog.mjs:594` se confirmó que NO basta para tokens route-scoped — hace falta también `injector: EnvironmentInjector`. Comentario actualizado.
- **Mover `PrintEntryTicketUseCase` de root a route-scoped** en lugar de mover `TICKET_RENDERER_TOKEN` a root. Razón: el ticket renderer es propio del dominio "parking" (ticket de entrada), no debería ser global. Mantener simetría con el resto de tokens route-scoped del feature.

## Bloqueos / Pendientes
Ninguno.

## Next Steps
- [ ] Considerar lint rule personalizada que falle si `dialog.open(` aparece sin `viewContainerRef` en el call site (eslint-plugin-custom o regex check en CI). No urgente.
- [ ] Continuar con Fase 8 (Offline / PowerSync) o Fase 11 (Siigo) según prioridad.
