# Spec: Vehicle Entry Form Component

## Tipo
Smart Component (orquesta el UseCase, pero presenta como dumb hacia sus hijos)

## Selector
`app-vehicle-entry-form`

## Propósito
Formulario reactivo para registrar la entrada de un vehículo. Captura placa, tipo de vehículo, color y marca. Pre-llena datos si existe búsqueda previa.

## Inputs

| Input | Tipo | Default | Descripción |
|---|---|---|---|
| preFilledData | Partial<VehicleEntity> | null | Datos pre-llenados de búsqueda anterior |
| isLoading | boolean | false | True mientras se procesa la entrada |
| disabled | boolean | false | Bloquea el form completo (overlay externo, ej. caja cerrada) |
| availableTypes | VehicleType[] \| null | null | Tipos con tarifa configurada. Chips fuera de la lista quedan deshabilitados con tooltip "Sin tarifa configurada — crea una en admin". `null` o lista vacía = todos habilitados (estado de carga). |
| monthlyPlanWarning | string \| null | null | Texto a mostrar como badge informativo (ej. mensualidad próxima a vencer). |

## Outputs

| Output | Tipo | Cuándo emite |
|---|---|---|
| submitted | {plate: string, vehicleType: VehicleType, color?: string, brand?: string} | Al hacer submit válido |
| cancelled | void | Al cancelar el formulario |

## Estados Visuales

- **Idle**: Formulario vacío listo para entrada
- **Loading**: Spinner, inputs deshabilitados, botón submit deshabilitado
- **With pre-filled data**: Campos pre-llenados, focus en siguiente campo vacío
- **Validation errors**: Mostrar errores bajo cada control (placa, tipo, etc)
- **Success**: Toast verde, limpiar formulario, volver a idle

## Validaciones Visibles

- **Placa**:
  - Requerida
  - Formato: "ABC123" o "ABC12D"
  - Mostrar error: "Placa debe ser ABC123 o ABC12D"
  
- **Tipo de vehículo**:
  - Requerido
  - Select con opciones: Carro, Moto, Bicicleta, Otro
  
- **Color y Marca**: Opcionales, pero si se llenan max 50 caracteres

## Comportamiento

1. Usuario ingresa placa
2. Al dejar el campo, mostrar spinner de búsqueda
3. UseCase `SearchVehicleByPlateUseCase` se invoca
4. Si existe vehículo: pre-llenar tipo, color, marca
5. Si no existe: dejar campos vacíos (nuevo vehículo)
6. Usuario selecciona tipo de vehículo (requerido si no estaba pre-llenado)
7. Usuario puede agregar color y marca (opcionales)
8. Botón "Registrar Entrada" se habilita cuando placa + tipo sean válidos
9. Submit: emitir `submitted` output
10. UseCase `RegisterVehicleEntryUseCase` se invoca en el componente padre

## NO hace (restricciones explícitas)

- NO invoca directamente el UseCase de registro (lo hace el padre)
- NO accede a BD directamente
- NO importa datos/ (solo recibe via @Input)
- NO guarda estado local de la sesión (es stateless respecto a entrada creada)

## Formulario Reactivo

```
ParkingForms.createEntryForm():
  - plate: FormControl (validators: [required, plateValidator])
  - vehicleType: FormControl (validators: [required])
  - color: FormControl (validators: [maxLength(50)])
  - brand: FormControl (validators: [maxLength(50)])
```

---
Status: Pendiente de Implementación
