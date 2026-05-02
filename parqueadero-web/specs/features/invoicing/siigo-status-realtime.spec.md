# Spec: Suscripción Realtime al estado Siigo de facturas

## Identificador
`invoicing/siigo-status-realtime`

## Descripción
UseCase + datasource que se suscribe a cambios en la tabla `invoices` vía **Supabase Realtime** (postgres_changes) para refrescar en vivo el estado Siigo (`siigo_status`, `siigo_number`, `siigo_pdf_url`, `siigo_observations`, `siigo_last_error`) en la página `invoices-list.page` y en cualquier vista de detalle.

Necesario porque el flujo es **asíncrono**: la EF `siigo-emit-invoice` retorna con la factura en `pending`, y el cron `siigo-poll-status` la lleva a `Stamped`/`Rejected` minutos después. Sin Realtime, el cajero/admin tendría que refrescar manualmente.

## Actor
Cualquier usuario autenticado (operador, admin, contador). Lo que ven está restringido por RLS de la tabla `invoices`.

## Pre-condiciones
- Usuario autenticado.
- Cliente Supabase con Realtime habilitado en la tabla `invoices` (configurar en Supabase Dashboard → Database → Replication → habilitar `invoices`).

## Input (Params)

```typescript
// Caso 1: observar una factura puntual
ObserveInvoiceStatusParams {
  invoiceId: string;
}

// Caso 2: observar todas las facturas que el rol ve (lista)
ObserveInvoicesListParams {
  // sin filtro — RLS filtra automáticamente; el cliente solo ve lo que ya veía en el SELECT inicial
}
```

## Output

```typescript
// Caso 1: observable que emite InvoiceEntity cada vez que cambia
Observable<InvoiceEntity>

// Caso 2: observable que emite eventos de cambio
Observable<{
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  invoice: InvoiceEntity | null;     // null en DELETE (solo el id)
  invoiceId: string;
}>
```

Sin `Either`/`Failure` — Realtime es un stream y los errores de conexión se manejan internamente (re-suscribir en background; loguear si persisten).

## Reglas

1. **RLS aplica a Realtime**: Supabase respeta las policies de `invoices` en el stream. Operador solo recibe eventos de sus propias facturas (las del día); admin/contador reciben todo. No hay riesgo de leak.
2. **Idempotencia**: si el componente se desmonta y re-monta (navegación), debe `unsubscribe` y volver a suscribirse limpio. Implementar en `ngOnDestroy`.
3. **Reconexión automática**: el cliente Supabase Realtime reintenta solo. No exponemos lógica de reconexión al UseCase.
4. **Filtrado**: el caso 1 usa filtro `id=eq.<invoiceId>` para reducir tráfico. El caso 2 NO filtra — recibe todos los eventos de la tabla y RLS los limita.
5. **Mapeo**: cada payload de Realtime trae `new` (UPDATE/INSERT) o `old` (DELETE) en snake_case. Aplicar el mismo `InvoiceMapper.toEntity(model)` que ya se usa para `getById`.

## Implementación

### Repository

Agregar método al contrato:

```typescript
// invoicing/domain/repositories/invoicing.repository.ts
export abstract class InvoicingRepository {
  // ... existentes
  abstract observeInvoiceStatus(invoiceId: string): Observable<InvoiceEntity>;
  abstract observeInvoicesListChanges(): Observable<InvoiceListChangeEvent>;
}

export interface InvoiceListChangeEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  invoice: InvoiceEntity | null;
  invoiceId: string;
}
```

### Datasource

```typescript
// invoicing/data/datasources/invoicing-remote.datasource.ts

observeInvoiceStatus(invoiceId: string): Observable<InvoiceEntity> {
  return new Observable<InvoiceEntity>((subscriber) => {
    const channel = this.supabase.client
      .channel(`invoice-${invoiceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invoices',
        filter: `id=eq.${invoiceId}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          subscriber.complete();
          return;
        }
        const entity = InvoiceMapper.toEntity(payload.new as InvoiceModel);
        subscriber.next(entity);
      })
      .subscribe();

    return () => {
      this.supabase.client.removeChannel(channel);
    };
  });
}

observeInvoicesListChanges(): Observable<InvoiceListChangeEvent> {
  return new Observable<InvoiceListChangeEvent>((subscriber) => {
    const channel = this.supabase.client
      .channel('invoices-list-watch')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invoices',
      }, (payload) => {
        const id = (payload.new as any)?.id ?? (payload.old as any)?.id;
        const entity = payload.eventType !== 'DELETE'
          ? InvoiceMapper.toEntity(payload.new as InvoiceModel)
          : null;
        subscriber.next({
          type: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          invoice: entity,
          invoiceId: id,
        });
      })
      .subscribe();

    return () => {
      this.supabase.client.removeChannel(channel);
    };
  });
}
```

### UseCase

```typescript
// invoicing/domain/usecases/observe-invoice-status.usecase.ts
@Injectable({ providedIn: 'any' })
export class ObserveInvoiceStatusUseCase {
  constructor(
    @Inject(INVOICING_REPOSITORY_TOKEN)
    private readonly repository: InvoicingRepository,
  ) {}

  execute(invoiceId: string): Observable<InvoiceEntity> {
    return this.repository.observeInvoiceStatus(invoiceId);
  }
}
```

(Análogo para `ObserveInvoicesListChangesUseCase`.)

### Smart component (`invoices-list.page.ts`)

```typescript
ngOnInit() {
  // Carga inicial
  this.loadInvoices();

  // Suscripción a cambios
  this.observeChanges = this.observeListUseCase
    .execute()
    .subscribe((event) => {
      if (event.type === 'INSERT') {
        this.invoices.update(list => [event.invoice!, ...list]);
      } else if (event.type === 'UPDATE') {
        this.invoices.update(list =>
          list.map(inv => inv.id === event.invoiceId ? event.invoice! : inv)
        );
      } else if (event.type === 'DELETE') {
        this.invoices.update(list =>
          list.filter(inv => inv.id !== event.invoiceId)
        );
      }
    });
}

ngOnDestroy() {
  this.observeChanges?.unsubscribe();
}
```

### Status badge en la tabla

Cada fila usa `<app-status-badge [status]="invoice.siigoStatus">` con variantes:

| `siigoStatus` | Variante | Label visible |
|---|---|---|
| `pending` | `warning` | "Pendiente" |
| `InProcess` | `info` | "Procesando DIAN" |
| `Sent` | `info` | "Enviada" |
| `Stamped` | `success` | "Estampada" |
| `Rejected` | `danger` | "Rechazada" |
| `queued_offline` | `neutral` | "En cola (sin conexión)" |
| `error_max_retries` | `danger` | "Error reintentos" |

### Botones por estado

| Estado | "Descargar PDF" | "Reintentar" | "Ver observaciones" |
|---|---|---|---|
| `Stamped && pdfUrl` | habilitado | — | si hay obs |
| `Rejected` | — | habilitado | siempre |
| `error_max_retries` | — | habilitado | siempre |
| Resto | deshabilitado | deshabilitado | si hay obs |

## Manejo offline

- Si el cliente está offline cuando se monta el componente: la suscripción Realtime queda en estado `closed`; al volver red se reconecta. Mientras tanto, los datos mostrados son los del SELECT inicial (que se sirvieron desde cache de PowerSync — Fase 8).
- Cuando vuelve la red, Supabase Realtime emite los eventos perdidos solo si el canal estuvo presence-tracked, lo cual no es nuestro caso. Por eso, **al reconectar también disparamos un re-fetch del SELECT** (`loadInvoices()`) para sincronizar el estado real.

## Dependencias

- `core/services/supabase.service.ts` — expone `client` con Realtime habilitado.
- `InvoicingRepository`, `InvoicingRepositoryImpl`, `InvoicingRemoteDataSource`.
- `InvoiceMapper` (ver `invoice.model.ts` extendido en S6).
- Tabla `invoices` con publicación Realtime habilitada en Supabase Dashboard.

## Tests

- Unit (datasource): mock de `supabase.client.channel().on().subscribe()`; emitir un payload simulado y verificar que el observable emite la entidad correctamente mapeada.
- Component: verificar que `invoices-list.page` actualiza la fila correcta cuando llega un UPDATE.
- E2E (manual durante S7): emitir factura, ver que pasa de `pending` a `Stamped` sin refrescar la página.

## Out of scope

- Notificaciones push del navegador cuando una factura cambia de estado — follow-up.
- Replay de eventos perdidos durante offline (Supabase Realtime no lo soporta out-of-the-box; se compensa con el re-fetch al reconectar).
