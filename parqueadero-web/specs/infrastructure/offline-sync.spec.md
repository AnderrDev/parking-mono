# Spec: Offline Sync Infrastructure

## Propósito
Sincronización bidireccional entre IndexedDB (local, vía PowerSync) y Supabase (remoto). Cuando hay conexión, sincroniza cambios locales pendientes. Cuando hay conexión remota, trae cambios remotos. Resuelve conflictos automáticamente con "last-write-wins" o "local-wins-on-ambiguous".

## Interfaz Pública

```typescript
class OfflineSyncService {
  // Observables
  isOnline$: Observable<boolean>
  syncStatus$: Observable<'idle' | 'syncing' | 'error'>
  conflictCount$: Observable<number>
  
  // Métodos
  initialize(): Promise<void>  // Init PowerSync, setup listeners
  syncNow(): Promise<void>     // Manual sync trigger
  resolveConflict(conflict: SyncConflict, resolution: 'local' | 'remote'): Promise<void>
  getConflicts(): Promise<SyncConflict[]>
  getOfflineQueue(): Promise<PendingOperation[]>
  
  // Internal
  enqueueOperation(table, op: 'insert' | 'update' | 'delete', data): Promise<void>
}
```

## Dependencias Externas

- **PowerSync SDK**: Para sincronización offline con IndexedDB
- **Supabase Realtime**: Para cambios en tiempo real (opcional, puede fallback a polling)
- **Browser API**: localStorage para banderas de estado, navigator.onLine para detectar offline

## Configuración

- `POWERSYNC_URL`: URL del servidor PowerSync (por ahora Supabase)
- `SYNC_INTERVAL`: Intervalo de sincronización automática (default 30s)
- `CONFLICT_STRATEGY`: 'last-write-wins' | 'local-wins' | 'manual' (default: 'last-write-wins')

## Tablas Sincronizadas

- parking_sessions
- vehicles
- customers
- invoices
- payments
- cashier_shifts
- monthly_plans
- users (read-only)
- tariffs (read-only)

## Manejo de Errores

- **Red caída durante sync**: Retentar con backoff exponencial (500ms → 1s → 2s → max 30s)
- **Conflict**: Si dois escrituras en el mismo registro:
  - Default (last-write-wins): Usar el timestamp más reciente
  - Sino: Marcar en conflictCount$ y esperar resolución manual
- **Storage lleno (IndexedDB 50MB)**: Limpiar registros deletados lógicamente, luego registros completados > 30 días

## Consideraciones de Seguridad

- Todos los datos en IndexedDB son sensibles (facturación, clientes, pagos)
- IndexedDB es accesible via DevTools pero no se puede exportar fácilmente
- Al logout: limpiar IndexedDB completamente
- RLS de Supabase protege lo que sincroniza (user solo ve sus datos)

## Flujo de Sincronización

```
1. OfflineSyncService.initialize() → setup PowerSync, listeners
2. User hace acción (entrada/salida) → enqueueOperation() en IndexedDB
3. Operación se guarda con _sync_status='pending'
4. Cada 30s o evento online: syncNow()
5. PowerSync valida contra RLS Supabase
6. Si OK: _sync_status='synced'
7. Si conflicto: _sync_status='conflict', emitir en conflictCount$
8. Si error: _sync_status='pending', reintentar en siguiente sync
```

## Ejemplo de Operación Offline

```
1. Operario registra entrada ABC123 sin conexión
2. Operation guardada en IndexedDB con id=uuid, _sync_status='pending'
3. UI muestra badge "Pendiente de sincronizar"
4. Vuelve la conexión
5. syncNow() se invoca automáticamente
6. PowerSync envía a Supabase, validación RLS, constraints
7. Si no hay conflicto: _sync_status='synced', badge desaparece
8. Si hay conflicto (otra entrada simultánea): badge roja, notificar operario
```

---
Status: Pendiente de Implementación
