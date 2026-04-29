# Spec: Calcular Tarifa de Parqueadero

## Identificador
`parking/calculate-parking-fee`

## Descripción
UseCase puro que calcula el monto a cobrar en función de la duración de la estancia, la tarifa vigente, el tipo de vehículo, minutos de gracia, y topes diarios. NO accede a BD, solo hace cálculos.

## Actor
Sistema (invocado por register-vehicle-exit, búsqueda de sesiones activas, reportes)

## Pre-condiciones
- Parámetros de entrada son válidos (no NULL, valores positivos)

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| durationMinutes | number | Sí | > 0, entero |
| tariff | TariffEntity | Sí | Valida, con unit, value_cents, grace_minutes, daily_cap_cents |
| isMonthly | boolean | Sí | true si hay mensualidad activa, false si es rotación |
| vehicleType | VehicleType | Sí | Enum: carro, moto, bicicleta, otro |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito (con cobro) | `Right<{amountCents: number, breakdown: {base, grace, cap}}>` | Monto final en centavos + desglose |
| Éxito (sin cobro) | `Right<{amountCents: 0, reason: 'grace'\|'monthly'}>` | Monto cero con razón |
| Error: parámetros inválidos | `Left<ValidationFailure>` | "Duración debe ser > 0" |

## Reglas de Negocio

1. **Minutos de gracia**: Si `durationMinutes < tariff.grace_minutes`, retornar amountCents=0 con reason='grace'.

2. **Mensualidad**: Si `isMonthly=true`, retornar amountCents=0 con reason='monthly' (no hay cobro adicional).

3. **Cálculo por unidad**:
   - Si tariff.unit = 'minuto': `amount = (durationMinutes * tariff.value_cents) / 60`
   - Si tariff.unit = 'hora': `amount = Math.ceil(durationMinutes / 60) * tariff.value_cents`
   - Si tariff.unit = 'fraccion': `amount = Math.ceil(durationMinutes / 30) * tariff.value_cents` (cada 30 min = fracción)
   - Si tariff.unit = 'dia': `amount = Math.ceil(durationMinutes / 1440) * tariff.value_cents` (cada 24h)

4. **Tope diario**: `finalAmount = Math.min(amount, tariff.daily_cap_cents)` — nunca se cobra más que el tope.

5. **Redondeo**: Todos los montos finales se redondean hacia arriba (Math.ceil) a centavos enteros.

## Flujo Principal

1. **Validar parámetros**
   - durationMinutes > 0 y es entero
   - tariff no NULL y tiene todos los campos
   - vehicleType en enum
   - Si alguno falla, retornar `ValidationFailure`

2. **Aplicar minutos de gracia**
   ```
   if (durationMinutes < tariff.grace_minutes) {
     return Right({ amountCents: 0, reason: 'grace' })
   }
   ```

3. **Aplicar mensualidad**
   ```
   if (isMonthly) {
     return Right({ amountCents: 0, reason: 'monthly' })
   }
   ```

4. **Calcular base según unidad**
   ```
   switch(tariff.unit) {
     case 'minuto': baseAmount = (durationMinutes * tariff.value_cents) / 60
     case 'hora': baseAmount = Math.ceil(durationMinutes / 60) * tariff.value_cents
     case 'fraccion': baseAmount = Math.ceil(durationMinutes / 30) * tariff.value_cents
     case 'dia': baseAmount = Math.ceil(durationMinutes / 1440) * tariff.value_cents
   }
   ```

5. **Aplicar tope diario**
   ```
   finalAmount = Math.min(baseAmount, tariff.daily_cap_cents)
   ```

6. **Redondear y retornar**
   ```
   amountCents = Math.ceil(finalAmount)
   return Right({
     amountCents,
     breakdown: {
       base: baseAmount,
       grace: tariff.grace_minutes,
       cap: tariff.daily_cap_cents,
       durationMinutes,
       unit: tariff.unit
     }
   })
   ```

## Edge Cases

- **Duración < 1 minuto**: Redondear a 1 minuto para cálculo (nunca gratis por duración menor a 1 minuto, a menos que aplique gracia)
- **Tarifa con unit desconocido**: Retornar `ValidationFailure` con mensaje descriptivo
- **Tope diario = 0**: No debería ocurrir en datos válidos, pero retornar `ValidationFailure` si sucede

## Dependencias

- Ninguna (es pure function)

## Mapping a UI

- **Uso**: Mostrar cálculo en tiempo real en `VehicleExitDialogComponent` mientras el usuario ve la salida
- **Ejemplo de display**:
  ```
  Vehículo ABC123 (Carro)
  Entrada: 14:30
  Salida: 15:35
  Duración: 1h 5m
  
  Tarifa: $5.000/hora
  Gracia: 10 minutos (aplicada ✓)
  
  Cálculo:
    Base: 2 horas × $5.000 = $10.000
    Tope diario: $30.000
    → TOTAL: $10.000 (COP)
  ```

---
Status: Pendiente de Implementación
