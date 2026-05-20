# Spec: Bloquear ingreso de vehículo sin tarifa pagada activa

**Estado:** implementado (2026-05-16)
**Fecha:** 2026-05-16
**Subproyecto:** parqueadero-web
**Afecta:** `vehicle-entry-form` + `operator-dashboard` (Capa 1 de la propuesta del 2026-05-16)

## Problema

Hoy el sistema permite registrar la entrada de cualquier vehículo. El bloqueo aparece **al cobrar** con el mensaje `"No hay tarifa activa para tipo de vehículo: moto"`. El operador se queda con un vehículo ingresado que no puede facturar — mala UX y data inconsistente.

Causa raíz en `vehicle-entry-form.component.ts:53-57`:
```ts
protected isTypeAvailable(t: VehicleType): boolean {
  const allowed = this.availableTypes();
  if (allowed === null || allowed.length === 0) return true;  // ← deja entrar todos
  return allowed.includes(t);
}
```
La intención original era "no bloquear durante el load inicial", pero el efecto colateral es que si no hay tarifas configuradas para un tipo, se permite igual.

## Comportamiento deseado

### Estados del selector de tipo de vehículo

| Estado | Visual | Interacción |
|---|---|---|
| **Cargando tarifas** (`availableTypes === null`) | Chips renderizados con skeleton/spinner pequeño; todos disabled | Click sin efecto |
| **Cargado, tipo CON tarifa** (`availableTypes !== null` y el tipo está en la lista) | Chip normal, habilitado | Click selecciona |
| **Cargado, tipo SIN tarifa** (`availableTypes !== null` y el tipo NO está en la lista) | Chip atenuado (opacity 0.45) + ícono ⚠️ | Click sin efecto. Tooltip: `"No hay tarifa configurada para {tipo}. Crea una en Tarifas para poder cobrar."` |
| **Cargado pero sin ninguna tarifa pagada** (`availableTypes !== null` y vacío) | Banner inline sobre el form | Submit deshabilitado, sin chip seleccionable |

### Banner inline (estados 3 y 4)

Cuando el operador selecciona un tipo bloqueado o el form arranca sin tarifas:

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️  No hay tarifa configurada para Moto                     │
│    Para registrar y cobrar motos, primero crea una tarifa.  │
│    [Crear tarifa de moto →]                                  │
└─────────────────────────────────────────────────────────────┘
```

- Variante para sin-tarifas-ninguna: "No hay tarifas configuradas. Crea al menos una para empezar a operar."
- El link `[Crear tarifa…]` navega a `/tariffs?prefill=moto` (la página de tariffs prellena el dialog de creación). Tras abrir el dialog, el query param se consume con `router.navigate([], { queryParams: { prefill: null }, queryParamsHandling: 'merge', replaceUrl: true })` para que un refresh no reabra el dialog.
- Solo se muestra a roles con permiso (`admin`); para `operador` el banner muestra: "Pide al administrador que configure una tarifa para {tipo} antes de continuar."

### Submit bloqueado

`onSubmit()` ya valida `form.invalid` → no envía. Hay que añadir: si el `vehicleType` seleccionado no está en `availableTypes`, marcar como inválido (forzar pattern de error en el form, no solo deshabilitar UI). Defensa en profundidad por si el operador manipula el DOM.

## Contrato del input

`availableTypes: VehicleType[] | null` mantiene la firma actual, pero cambia la semántica:

| Valor | Significado |
|---|---|
| `null` | Cargando — todos los chips disabled con skeleton |
| `[]` | Cargado, ninguna tarifa configurada — banner global + submit bloqueado |
| `[t1, t2, ...]` | Cargado con N tipos disponibles — el resto disabled con tooltip |

Esto rompe la convención actual ("vacío = todavía no cargado"). El padre (`operator-dashboard`) ya distingue `null` (signal sin inicializar) de `[]` (resultado real) — solo hay que asegurar que se setea a `[]` cuando `loadTariffs()` termina con 0 tarifas.

## Cambios

### `vehicle-entry-form.component.ts`
1. `isTypeAvailable(t)` cambia a:
   ```ts
   const allowed = this.availableTypes();
   if (allowed === null) return false;  // cargando
   return allowed.includes(t);
   ```
2. Nuevo método `isLoading()`: `this.availableTypes() === null`.
3. Nuevo método `hasNoTariffs()`: `this.availableTypes()?.length === 0`.
4. Validación extra en `onSubmit()`: rechazar si el tipo seleccionado no está en `availableTypes`.

### `vehicle-entry-form.component.html`
1. Aplicar skeleton/spinner a los chips cuando `isLoading()`.
2. Mostrar banner cuando `hasNoTariffs()` o cuando el tipo seleccionado está bloqueado.
3. Tooltip en chip disabled con el mensaje del § "Estados del selector".
4. Si rol = admin, link `Crear tarifa →`. Si operador, mensaje pasivo.

### `vehicle-entry-form.component.scss`
- Estilos `chip--unavailable` (opacity, no cursor, ícono warning).
- Estilo `tariff-banner` (warning suave, no rojo agresivo).

### `operator-dashboard.page.ts:311-325` (loadTariffs)
- Ya setea `activeTariffs` correctamente. Verificar que `availableTypesForEntry` computed deriva `[]` cuando el map está vacío (no `null`).

### `parqueadero-web/src/app/features/tariffs/.../tariffs-list-page` (o donde corresponda)
- Aceptar query param `?prefill=<vehicle_type>` para abrir directamente el dialog de creación con `vehicleType` y `unit` prellenados (sugerir `'hora'` como unidad inicial razonable).

## Fuera de alcance (van en Capa 2 y 3 — sesiones futuras)
- Persistir `tariff_id` en `parking_sessions` al ingresar.
- Matriz de cobertura `(vehicleType × unit)` en el admin de tariffs.
- Permitir crear "una tarifa con múltiples unidades" desde el dialog.

## Verificación (manual, en `ng serve` contra remoto)

1. Sin tarifas en BD: abrir dashboard → banner "No hay tarifas configuradas". Submit deshabilitado.
2. Con tarifa de carro pero NO de moto: el chip de carro habilitado, el de moto atenuado con tooltip. Submit habilitado solo si tipo = carro.
3. Click en "Crear tarifa de moto →" como admin: navega a `/admin/tariffs` y abre dialog con `vehicleType=moto` prellenado.
4. Crear tarifa de moto, volver al dashboard → chip de moto se habilita sin recargar (signal reacciona).
5. Como operador (no admin): el banner muestra mensaje pasivo, sin link.

## Bitácora
Sesión `sessions/2026-05-16-dev-apunta-remoto.md` (extender) o nueva sesión.
