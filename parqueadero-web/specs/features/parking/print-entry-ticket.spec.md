# Spec: Imprimir ticket de entrada (térmico POS + QR)

**Versión:** 2.1 (2026-05-20) — sin consecutivo numérico

## Identificador
`parking/print-entry-ticket`

## Descripción
UseCase que genera y dispara la impresión automática del ticket de entrada en una impresora térmica POS dedicada (80 mm), apenas se confirma el registro de un nuevo vehículo. Incluye un código QR con el `session.id` para acelerar la búsqueda en la salida.

### Cambios v2 (2026-05-20)

A pedido del cliente, el ticket adopta el branding del recibo BSNR usado tradicionalmente en parqueaderos colombianos:

- **Tipo de parqueadero** (`PARQUEADERO PÚBLICO` / `PRIVADO`) en banner negro arriba del nombre.
- **Resolución** legal (parqueadero público) y **NIT-DV** en el header.
- **Tabla completa de tarifas activas** (todos los `vehicle_type`, no solo el actual).
- **Banner `✓ CLIENTE MENSUAL`** si la sesión tiene `monthlyPlanId`.
- **Horario de cierre** ("Hasta las 18:00") destacado con bordes superior/inferior.
- **Dirección + teléfono** en footer con prefijo ☎.
- Se cambió la tipografía del cuerpo de Courier (monospace) a Helvetica Neue (sans-serif) excepto datos numéricos (placa, valores) que mantienen monospace para legibilidad térmica.

### Cambio v2.1 (2026-05-20)

Se eliminó el bloque del consecutivo numérico en rojo a pedido del cliente: el ticket no necesita un consecutivo visible — el QR ya identifica la sesión de forma única. Esto implica:
- No se aplica la migration `00022_ticket_number_sequence.sql` (eliminada del repo).
- Se quita el campo `ticketNumber` de `ParkingSessionEntity`, `ParkingSessionModel` y `ExitReceipt`.
- El bloque `.ticket-number` y los helpers `formatTicketNumber()` salen del renderer.

## Estrategia de impresión

**`window.print()` con CSS `@page` 80 mm**, no WebUSB/ESC-POS directo. Razones:
- Funciona con cualquier impresora térmica que tenga driver instalado en el SO (Epson TM-T20, Bixolon, Citizen, genéricas chinas), independiente del navegador.
- "Auto-imprime" sin diálogo si el usuario marcó "imprimir siempre con esta impresora" en Chrome/Edge (`Always print using this destination`).
- WebUSB ESC/POS exige autorización por dispositivo, solo Chrome/Edge desktop, y se rompe si cambian la impresora — queda como follow-up si después se necesita beep / corte / drawer-kick.

## Actor
Sistema (invocado por `vehicle-entry-modal` tras éxito de `RegisterVehicleEntryUseCase`).

## Pre-condiciones
- Sesión recién creada (`session.id` válido, status='active').
- Tarifa vigente del tipo de vehículo cargada en memoria.

## Input (Params)

```typescript
interface PrintEntryTicketParams {
  session: ParkingSessionEntity;
  tariffSnapshot: TariffEntity | null;  // tarifa vigente del tipo de vehículo
  parkingInfo?: {                        // se carga del app_settings.parking_info (v2)
    name: string;
    nit: string;
    dv: string;
    address: string;
    phone: string;
    parkingType: 'publico' | 'privado' | '';
    resolutionNumber: string;
    closingTime: string;     // formato libre "18:00" o "6:00 P.M."
  };
}
```

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<{ printedAt: Date }>` | `window.print()` se disparó sin lanzar |
| Sin permisos popup | `Left<NetworkFailure>` | El navegador bloqueó `window.open()` |
| Render falló | `Left<ServerFailure>` | Error generando QR o HTML |

NO retorna `Left` por "el usuario canceló el diálogo de impresión" — eso es indistinguible de "se imprimió" desde JS.

## Reglas de Negocio

1. **No bloquea**: si el ticket falla, el dashboard NO muestra error. La sesión está creada; el ticket es accesorio.
2. **QR contiene SOLO el `session.id`** (UUID, ~36 chars). No incluye placa, monto, ni payload firmado — la salida hace lookup contra BD para todo lo demás.
3. **Tarifa snapshot opcional**: si no hay tarifa cargada, el ticket omite la línea "Tarifa vigente" (no falla).
4. **Sin numeración secuencial** (v2.1): el ticket NO es factura, no requiere consecutivo. El QR + `session.id` cumplen el rol de identificador único.
5. **Idempotencia**: si la EF se invoca dos veces seguidas con el mismo session, imprime dos veces — es responsabilidad del caller no invocarlo doble.
6. **Hora local Bogotá**: `entryAt` se formatea con `toBogotaDateTime()` del `date.utils.ts`.

## Flujo Principal

1. Cargar `parking_info` desde `app_settings` si no vino en params (cache local OK).
2. Generar QR data URL: `await QRCode.toDataURL(session.id, { width: 180, margin: 1 })`.
3. Construir HTML usando la plantilla (ver §Plantilla).
4. `printWindow = window.open('', '_blank', 'width=400,height=600')`. Si retorna null → `Left(NetworkFailure('popup bloqueado'))`.
5. `printWindow.document.write(html)` y `printWindow.document.close()`.
6. Esperar `load` event (o 100 ms timeout) para que el QR `<img>` cargue.
7. `printWindow.focus()` + `printWindow.print()`.
8. `printWindow.close()` 1 segundo después (para evitar cerrar antes de que termine la cola de impresión).
9. Retornar `Right({ printedAt: new Date() })`.

## Layout v2

```
┌──────────────────────────────┐
│   PARQUEADERO PÚBLICO        │  ← banner negro (si parkingType)
│                              │
│        COCOPARKING           │  ← nombre del negocio (h1)
│   NIT 52.210.596-8           │  ← biz-meta
│   Resolución 18764107780828  │
│                              │
│ PLACA                        │  ← section-label
│ ┌──────────────────────────┐ │
│ │       ABC123             │ │  ← plate-box
│ └──────────────────────────┘ │
│                              │
│ Tipo      Carro              │  ← data-grid 2 cols
│ Fecha     20/05/2026         │
│ Entrada   14:23              │
│                              │
│ [✓ CLIENTE MENSUAL]          │  ← solo si isMonthly
│ Tu tarifa: $100 / minuto     │  ← solo si NO mensual
│                              │
│ TARIFAS                      │
│ Carro    $ 100 / minuto      │
│ Moto     $  60 / minuto      │
│                              │
│        [QR 130x130]          │
│ Conserve este ticket         │
│ para registrar la salida     │
│                              │
│ - - - - - - - - - - - - - -  │
│ Carrera 17 # 19A - 06        │
│ ☎ 311 5922330                │
│                              │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│   Hasta las 18:00            │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                              │
│ session: 8c8a90f-...         │
└──────────────────────────────┘
```

## Plantilla HTML (80 mm — v2)

```html
<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="utf-8">
  <title>Ticket entrada {{ plate }}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    @media print {
      html, body { margin: 0; padding: 0; }
    }
    body {
      width: 72mm;            /* 80mm − 4mm margen interno cada lado */
      margin: 0 auto;
      padding: 4mm 4mm 6mm;
      font-family: 'Courier New', ui-monospace, monospace;
      font-size: 11pt;
      line-height: 1.25;
      color: #000;
    }
    h1 {
      font-size: 13pt;
      font-weight: 700;
      text-align: center;
      margin: 0 0 2mm;
      text-transform: uppercase;
    }
    .subhead { text-align: center; font-size: 9pt; margin-bottom: 2mm; }
    hr { border: 0; border-top: 1px dashed #000; margin: 3mm 0; }
    .row { display: flex; justify-content: space-between; }
    .row b { font-weight: 700; }
    .plate {
      font-size: 18pt;
      font-weight: 700;
      text-align: center;
      letter-spacing: 2px;
      margin: 2mm 0;
    }
    .tariff { font-size: 10pt; margin: 1mm 0; }
    .qr { text-align: center; margin: 3mm 0 1mm; }
    .qr img { width: 180px; height: 180px; image-rendering: pixelated; }
    .footer {
      text-align: center;
      font-size: 9pt;
      margin-top: 2mm;
    }
    .session-id {
      font-size: 7pt;
      text-align: center;
      word-break: break-all;
      margin-top: 1mm;
      color: #333;
    }
  </style>
</head>
<body>
  <h1>{{ parkingName }}</h1>
  <p class="subhead">
    NIT {{ nit }}-{{ dv }}<br>
    {{ address }}<br>
    Tel {{ phone }}
  </p>
  <hr>
  <div class="plate">{{ plate }}</div>
  <div class="row"><b>Tipo:</b><span>{{ vehicleTypeLabel }}</span></div>
  <div class="row"><b>Entrada:</b><span>{{ entryAtFormatted }}</span></div>
  {{#if tariffLine}}
  <div class="tariff">{{ tariffLine }}</div>
  {{/if}}
  <hr>
  <div class="qr"><img src="{{ qrDataUrl }}" alt="QR sesión"></div>
  <p class="footer">
    Conserve este ticket para<br>registrar la salida.
  </p>
  <div class="session-id">{{ sessionId }}</div>
</body>
</html>
```

`tariffLine` ejemplo: `"Carro $100/min · $3.600/h · plena $12.000 · gracia 10 min"`.

**Formato unificado tras la feature de tarifa tiered** (ver `parqueadero-backend/specs/tariffs-pricing.spec.md`):
`$<perMinuteCents>/min · $<perHourCents>/h · plena $<plenaCents>[ · gracia <graceMinutes> min]`. Los tres rates se muestran porque cada uno gana en distintos rangos de duración (MIN de los tres). Si la tarifa cargada es legacy (sin los 3 campos nuevos), el ticket cae al formato viejo `$<valueCents>/<unit>` para back-compat.

## Dependencias

- npm `qrcode` (^1.5.x) — generación de QR a data URL. Vanilla, ~25 KB gzipped.
- `app_settings.parking_info` extendido con `parkingType`, `resolutionNumber`, `closingTime` (poblar desde la página `/settings` → Datos del ticket impreso). No requiere migration (JSONB es schemaless); los campos viejos se preservan.
- Helpers existentes: `formatCOP`, `toBogotaDateTime`, `vehicleTypeLabel`.

## DI / Estructura

```
features/parking/domain/usecases/print-entry-ticket.usecase.ts
features/parking/data/services/ticket-renderer.service.ts   ← genera HTML + QR
```

`PrintEntryTicketUseCase.execute(params)` → llama al renderer, abre popup, dispara print, retorna `Either`.

`TicketRendererService` queda en data/ porque toca DOM (`window.open`); el UseCase solo orquesta.

## Edge Cases

- **Popup bloqueado**: navegador bloquea `window.open` por defecto en algunos contextos. Mitigación: el operator-dashboard debe asegurarse de que la primera invocación venga de un evento de click directo del usuario (lo cumple — el modal se cierra desde el click "Confirmar"). Si igual falla, retorna `Left(NetworkFailure)` pero NO toast — solo log.
- **Sin impresora configurada**: el SO mostrará el diálogo de impresión normal; el operador puede cancelar. La sesión queda igual creada.
- **Impresora apagada / sin papel**: el SO acumula el job; cuando se prenda, sale. Sin acción del sistema.
- **Tarifa null**: omite la línea `tariff`.
- **Offline (PowerSync queda pendiente sync)**: el `session.id` se generó client-side (UUID v4 cliente) y se mantiene tras sync — el QR sigue válido.

## Lectura del QR a la salida (out of scope para esta spec)

Se especifica aparte (`scan-entry-qr.spec.md`, futuro). Resumen del flow esperado:
- Pistola lectora QR USB inyecta el UUID como teclado.
- Input `<app-search-input>` con flag `data-qr-target` lo recibe.
- Si el texto matchea formato UUID, se hace `getSessionById(uuid)` y se abre el `vehicle-exit-dialog` directamente.

## Mapping a UI

- **Invocación**: `vehicle-entry-modal.component` tras `Right(session)` del UseCase de registro.
- **Feedback al usuario**:
  - Éxito impresión: ninguno extra (el toast "Entrada registrada" del dashboard ya cubre).
  - Falla impresión: log a consola, toast warning sutil "No se pudo imprimir el ticket — la entrada quedó registrada." (Opcional, decidir en implementación si añade ruido.)

## NO hace

- NO maneja impresión vía WebUSB/WebSerial ESC-POS.
- NO genera PDF descargable (es un comprobante interno, no documento legal).
- NO requiere conexión (el QR y HTML se generan client-side; impresión es local).
- NO escribe en BD (solo lee `app_settings.parking_info`).

---
Status: Especificado 2026-05-04 — v1 implementado. v2 (datos legales + rediseño) implementado 2026-05-20. v2.1 (sin consecutivo, sin migration 00022) misma fecha.
