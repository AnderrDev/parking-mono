# Spec: Captura de datos fiscales en cierre de venta (cashier)

## Identificador
`parking/cashier-fiscal-data-capture`

## Descripción
Extiende el componente `vehicle-exit-dialog` (Fase 4.B) para soportar el flujo de **emisión de factura electrónica vía Siigo** (Fase 11 / S6). El cajero al cobrar marca un toggle "Emitir factura electrónica"; si el cliente seleccionado no tiene los datos fiscales necesarios para Siigo, el dialog despliega un mini-formulario inline para completarlos y los persiste en `customers` antes de invocar la Edge Function `siigo-emit-invoice`.

**No reemplaza** la captura de cliente que ya existe (HU-040, búsqueda con debounce). La extiende.

## Actor
Operador, Admin (en el flujo de cobro al cerrar sesión).

## Pre-condiciones
- Usuario autenticado.
- Sesión de parking activa, lista para cerrar.
- Toggle `emitInvoice` ya existe en el dialog (`vehicle-exit-dialog.component.ts:30,77,143`); esta spec extiende su comportamiento.

## Reglas de visibilidad del toggle

| Caso | Toggle "Emitir factura electrónica" |
|---|---|
| Salida normal (efectivo/tarjeta/etc., monto > 0) | Visible y habilitado |
| Salida con cortesía (monto $0 por cortesía) | Visible y habilitado (Siigo permite FE de $0) |
| Salida con error de entrada (monto $0) | Oculto (no aplica FE) |
| **Salida contra plan mensual** (`paymentMethod = 'mensual'`) | **Bloqueado**: oculto o deshabilitado con tooltip "La facturación de mensualidades se gestiona aparte" |
| Cliente offline (sin red) | Visible y habilitado (la factura queda `queued_offline`, ver Fase 8) |

**Regla clave**: si la sesión cierra contra mensualidad, no se emite FE (decisión de Fase 11). El web debe bloquear y la EF `siigo-emit-invoice` también defiende con 409.

## Reglas de validación de datos fiscales

Cuando `emitInvoice = true`, el cliente seleccionado debe tener todos estos campos no vacíos:

| Campo | Origen | Validación |
|---|---|---|
| `doc_type` | `customers.doc_type` | `'cedula' \| 'nit' \| 'pasaporte'` |
| `doc_number` | `customers.doc_number` | string no vacío, dígitos para CC/NIT, alfanumérico para pasaporte |
| `name` | `customers.name` | string no vacío, mínimo 3 chars |
| `email` | `customers.email` | email válido |

Si **alguno falta**, el dialog despliega un sub-formulario "Datos fiscales del cliente" inline (debajo del selector de cliente) con esos campos; los precarga con lo que ya hay en el customer y bloquea el botón "Confirmar salida" hasta que estén todos válidos.

### Campos opcionales pero recomendados (Siigo los acepta vacíos, pero la factura se ve mejor con ellos)

| Campo | Origen | Comportamiento |
|---|---|---|
| `phone` | `customers.phone` | Si falta, no se exige; el sub-form lo muestra como opcional. |
| `address` | `customers.address` | Idem. |
| `municipio`, `departamento` | `customers.municipio/departamento` | Idem. |
| `dv` (dígito de verificación NIT) | `customers.dv` | Solo si `doc_type='nit'`. Validador `nitValidator()` ya existe en shared. Si no calcula DV, lo deja en blanco (Siigo lo acepta). |
| `responsabilidades_fiscales` | `customers.responsabilidades_fiscales` | Si vacío, default `['R-99-PN']` (No responsable IVA, persona natural). Para NIT, se sugiere `['O-13']` u otro según régimen — pero esta lista es follow-up; en Fase 11 dejamos `R-99-PN` por defecto. |

## Input (Params del dialog → caller)

El componente sigue retornando un `ExitFormValue` (interfaz ya existente). Se extiende el contrato:

```typescript
export interface ExitFormValue {
  paymentMethod: PaymentMethod;
  justification: string;
  emitInvoice: boolean;                                         // ya existe
  cashReceivedCents: number | null;
  customerId: string | null;                                     // ya existe
  // Nuevo: si el operador completó datos fiscales, vienen aquí para que el caller
  // haga UPDATE customers antes de llamar a siigo-emit-invoice.
  customerFiscalUpdates: Partial<{
    docType: 'cedula' | 'nit' | 'pasaporte';
    docNumber: string;
    name: string;
    email: string;
    phone: string | null;
    address: string | null;
    municipio: string | null;
    departamento: string | null;
    dv: number | null;
    responsabilidadesFiscales: string[] | null;
  }> | null;
}
```

Si `customerFiscalUpdates` es `null`, los datos del cliente ya estaban completos.
Si tiene contenido, el caller (smart component) hace primero `UpdateCustomerUseCase.execute({id: customerId, updates})` y luego invoca `RequestInvoiceUseCase` (que apunta a `siigo-emit-invoice`).

## Flujo

```
1. Cajero abre dialog de salida.
2. Tarifa calculada → muestra monto.
3. Cajero marca toggle "Emitir factura electrónica".
   ↳ Si paymentMethod = 'mensual' → toggle bloqueado, mensaje informativo.
4. Cajero selecciona cliente vía búsqueda (HU-040 ya existe).
5. Validador on-blur: si cliente.name/doc_type/doc_number/email faltan → expandir sub-form fiscal con esos campos precargados.
6. Cajero completa sub-form. El botón "Confirmar salida" se habilita solo cuando:
   - Form principal válido (paymentMethod, cashReceived suficiente si efectivo, etc.).
   - emitInvoice=true → customerId no null Y datos fiscales completos.
   - emitInvoice=false → cualquiera.
7. Submit → dialog retorna ExitFormValue con customerFiscalUpdates si aplica.
8. Smart caller (operator-dashboard.page o similar):
   - Si customerFiscalUpdates: await UpdateCustomerUseCase.execute(...)
   - await RegisterVehicleExitUseCase.execute(...) → cierra sesión + crea payment
   - Si emitInvoice: await RequestInvoiceUseCase.execute({sessionId, customerId, notes}) → invoca siigo-emit-invoice
   - Toast con resultado:
     - Si Siigo Stamped instantáneo → "Factura emitida #{siigo_number}"
     - Si pending → "Factura en proceso (interno: #{internal_number}). Verás el estado actualizarse en la lista."
     - Si Rejected/error → "Factura rechazada por DIAN: #{reason}. Reintenta o consulta admin."
```

## UI específica del sub-formulario fiscal

Solo visible cuando:
- `emitInvoice = true` Y
- `customerId !== null` Y
- alguno de (`doc_type`, `doc_number`, `name`, `email`) del cliente seleccionado falta.

```
┌─ Cliente seleccionado: María Rodríguez (CC 1234567890) ──┐
│ ⚠️ Faltan datos para emitir factura electrónica:         │
│                                                           │
│ [Email] *  ____________________  (requerido)              │
│                                                           │
│ Datos opcionales:                                         │
│ [Teléfono]  ____________________                          │
│ [Dirección] ____________________                          │
│ ...                                                       │
│                                                           │
│ Estos datos se guardarán en el cliente.                   │
└───────────────────────────────────────────────────────────┘
```

- El cajero NO puede deseleccionar el cliente desde el sub-form (eso se hace en el selector arriba).
- Cancelar el dialog descarta los cambios fiscales (no se persisten a `customers`).

## Casos borde

- **Cliente nuevo creado al vuelo**: si en HU-040 el cajero elige "Crear cliente nuevo" (futuro), el sub-form se reusa con todos los campos vacíos.
- **Datos fiscales completos pero email cambia**: el sub-form solo se muestra si falta algo. Si el cajero quiere cambiar un email existente, debe ir a la pantalla de admin de clientes (fuera de scope del dialog).
- **Doble submit**: deshabilitar botón "Confirmar salida" mientras el dialog procesa.
- **Offline**: si está offline al hacer submit con `emitInvoice=true`:
  - La sesión cierra normalmente (UseCase de salida funciona offline).
  - El customer update va a cola PowerSync (Fase 8).
  - La EF `siigo-emit-invoice` no se llama; en su lugar se INSERT directamente en `invoices` con `siigo_status='queued_offline'`, `requested_invoice=true`. Toast: "Factura encolada — se emitirá al recuperar conexión". Detalles en `siigo-status-realtime.spec.md`.

## Dependencias

- `vehicle-exit-dialog.component.ts` (extender)
- `parking.forms.ts` → agregar campos opcionales para datos fiscales
- `customers/domain/usecases/update-customer.usecase.ts` (existe)
- `invoicing/domain/usecases/request-invoice.usecase.ts` (renombrado endpoint, ver `request-invoice.spec.md`)

## Tests

- Unit: `applyDynamicValidators` cuando `paymentMethod='mensual'` debe bloquear toggle.
- Unit: cliente sin email + `emitInvoice=true` → form invalid; con email → form valid.
- Component: render del sub-form solo cuando faltan datos.
- Component: submit retorna `customerFiscalUpdates` no null si se editó el sub-form.

## Out of scope

- Pantalla de admin de clientes con CRUD completo (existe ya en feature `customers`).
- Validador de DV de NIT que calcula automáticamente — fuera de Fase 11; queda como follow-up usar `nitValidator` existente.
- Carga masiva de clientes desde Siigo Nube → este local (sync inversa). Por ahora solo creamos en Siigo desde aquí.
