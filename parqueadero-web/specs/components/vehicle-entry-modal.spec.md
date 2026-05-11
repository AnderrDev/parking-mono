# Spec: Vehicle Entry Modal Component

## Tipo
Smart Component — wrapper modal que orquesta `RegisterVehicleEntryUseCase` y dispara `PrintEntryTicketUseCase` tras éxito.

## Selector
`app-vehicle-entry-modal` (montado via Angular CDK Dialog desde `operator-dashboard.page`).

## Propósito
Capturar los datos de un vehículo para registrar su entrada al parqueadero, persistir la sesión vía UseCase, y disparar la impresión automática del ticket térmico al confirmar. Reemplaza el panel inline "Registrar entrada" del dashboard previo.

## Por qué modal y no inline

Decidido 2026-05-04 con el usuario. Razones:
- La lista de vehículos en parqueadero recupera ancho completo (más sesiones legibles).
- El acto de "registrar entrada" pasa a ser un evento discreto con feedback fuerte (modal + ticket impreso) en lugar de un form ambiente.
- Contraste con la decisión previa (`feedback_dashboard_density.md`): la densidad se conserva en consulta y salida; solo el ingreso pasa a flow modal.

## Apertura

| Trigger | Origen |
|---|---|
| Click en botón "Registrar entrada" del header | Desktop |
| Click en FAB bottom-right | Mobile (<768 px) |
| Tecla `N` global | Atajo (no si caja cerrada / modal ya abierto / foco en input) |

El dispatch se hace en `operator-dashboard.page` con `Dialog.open(VehicleEntryModalComponent, { ... })`.

## Inputs (vía `DIALOG_DATA`)

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| availableTypes | VehicleType[] \| null | null | Tipos con tarifa configurada. Igual que el form actual. |
| prefillPlate | string \| null | null | Placa pre-llenada si el usuario llegó al modal desde el buscador (futuro). |

## Outputs (vía `Dialog.afterClosed()`)

| Resultado | Tipo | Cuándo |
|---|---|---|
| Registrada | `{ session: ParkingSessionEntity, ticketPrinted: boolean }` | Confirmar exitoso |
| Cancelada | `null` | Esc / botón "Cancelar" |

## Comportamiento

### Flow exitoso (caso feliz)
1. Usuario abre modal → focus auto en input "Placa".
2. Usuario teclea placa → al `blur` (o tras 500 ms), se dispara `SearchVehicleByPlateUseCase`.
3. Si la placa ya existe: pre-llena `vehicleType`, `color`, `brand`. Foco salta a botón "Confirmar".
4. Si no existe: queda en `vehicleType` (requerido).
5. Usuario completa lo opcional (color, marca) y pulsa "Confirmar".
6. Botón muestra spinner inline; modal queda abierto.
7. `RegisterVehicleEntryUseCase.execute(...)` → `Right(session)`.
8. **Auto-print** del ticket térmico vía `PrintEntryTicketUseCase` (ver `print-entry-ticket.spec.md`).
   - Se intenta sin esperar al resultado de impresión (no bloquea UX).
   - Si la impresión falla (sin impresora, popup blocker), se registra en consola pero NO se muestra error — la sesión está creada.
9. Modal cierra con `{ session, ticketPrinted: <bool> }`.
10. Dashboard muestra toast "Entrada registrada · {plate}" y la session-card aparece con animación slide-in.

### Errores backend (validación / conflicto)
- `ValidationFailure` / `BusinessRuleFailure`: se muestran **inline en el modal** (memoria del usuario sobre dialogs admin: errores backend no cierran modal). Mensaje en banner rojo arriba del form. El usuario corrige y re-envía.
- `NetworkFailure`: banner rojo con copy "Sin conexión — revisa tu red e intenta de nuevo." El form queda intacto.
- Si la validación dice "ya existe sesión activa para esa placa": banner con CTA "Ver sesión activa" que cierra el modal y hace scroll a la session-card correspondiente.

### Cancelar
- `Esc`, botón "Cancelar", o click en backdrop **NO cierran si hay datos sin enviar** (excepto solo `placa` vacía + `vehicleType` vacío). Si hay datos, mostrar `<app-confirm-dialog>` "¿Descartar lo escrito?" antes de cerrar. Esto evita pérdidas accidentales.
- Click en backdrop nunca cierra (CDK Dialog `disableClose: true`); solo Esc o cancelar.

## Estructura

```
<app-vehicle-entry-modal>
  <header>
    <h2>Registrar entrada</h2>
    <button [aria-label]="'Cerrar'" (click)="onCancel()">×</button>
  </header>

  @if (errorBanner()) {
    <div role="alert" class="modal-error">{{ errorBanner() }}</div>
  }

  <app-vehicle-entry-form
    [availableTypes]="data.availableTypes"
    [preFilledData]="prefillData()"
    [isLoading]="submitting()"
    (submitted)="onSubmit($event)"
  />

  <footer>
    <button class="btn btn--ghost" (click)="onCancel()">Cancelar</button>
    <button class="btn btn--primary" (click)="entryForm.submit()" [disabled]="submitting()">
      {{ submitting() ? 'Registrando…' : 'Confirmar' }}
    </button>
  </footer>
</app-vehicle-entry-modal>
```

El form interno (`<app-vehicle-entry-form>`) se reutiliza tal cual — el wrapper solo añade botones del footer + manejo de cancelación + banner de error. El submit se delega al `(submitted)` output existente del form.

## Dimensiones y estilo

- Width: `min(560px, 100vw - 32px)` desktop; full-screen en mobile (<480 px).
- Altura: contenido + padding; sin scroll interno (form cabe en una pantalla).
- Backdrop: `--color-overlay` con blur 4 px.
- Animación apertura: scale `0.96 → 1` + fade `0 → 1` en 180 ms.

## A11y

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` apuntando al `<h2>`.
- Focus trap automático del CDK Dialog.
- Restore focus al elemento que disparó la apertura (botón header / FAB).
- `Esc` cierra (con confirm si hay datos).
- Anuncio del banner de error vía `role="alert"`.

## Auto-print: contrato con el ticket

Al confirmar exitoso:

```typescript
const printResult = await this.printEntryTicket.execute({
  session: result.value,
  tariffSnapshot: this.tariffsState.findActive(result.value.vehicleType),
});
this.dialogRef.close({
  session: result.value,
  ticketPrinted: printResult.isRight(),
});
```

Si `printResult` es `Left`, NO se levanta error — la entrada existe; el usuario puede re-imprimir desde la lista de sesiones (futuro: botón "Imprimir ticket" en cada session-card).

## NO hace

- NO recalcula tarifa (la lee del estado local del dashboard, que ya tiene tariffs cargadas).
- NO valida server-side por sí mismo (delega al UseCase).
- NO genera el QR ni el HTML del ticket — eso es del `PrintEntryTicketUseCase`.
- NO muestra preview del ticket antes de imprimir (auto-print directo, sin diálogo intermedio).

## Dependencias técnicas

- `Dialog` de `@angular/cdk/dialog`.
- `RegisterVehicleEntryUseCase` (ya existe).
- `SearchVehicleByPlateUseCase` (ya existe — usado para autocompletar).
- `PrintEntryTicketUseCase` (NUEVO — ver `parqueadero-web/specs/features/parking/print-entry-ticket.spec.md`).
- `<app-vehicle-entry-form>` (existente, sin cambios estructurales — ver `vehicle-entry-form.spec.md`).

---
Status: Especificado 2026-05-04 — implementación pendiente.
