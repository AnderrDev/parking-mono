# CLAUDE.md — Sistema de Administración de Parqueadero
## Especificación Técnica Completa - Repo: parqueadero-web (Angular PWA)

**Versión:** 1.0  
**Última actualización:** 2026-04-28  
**Metodología:** Spec-Driven Development (SDD)

---

## INTRO: QUÉ ES ESTE ARCHIVO

Este archivo es la **fuente de verdad** para el desarrollo de `parqueadero-web`. Contiene:

1. **SDD completo**: Cómo escribimos specs, contratos e implementaciones
2. **Arquitectura limpia**: Reglas de capas (Domain, Data, Presentation)
3. **Estructura de carpetas**: Dónde vive cada tipo de archivo
4. **Convenciones**: Nombres, patrones, imports, formularios

**Regla de oro**: Antes de implementar CUALQUIER cosa, verifica que la spec existe en `specs/`. Si no existe, créala primero. No saltamos del paso 1 (SPEC) al paso 4 (IMPLEMENTAR).

---

## 1. SPEC-DRIVEN DEVELOPMENT (SDD)

### 1.1 El Ciclo Completo

```
1. SPEC       → Escribir en specs/ (qué hace, inputs, outputs, reglas)
2. CONTRATO   → Interfaz/abstract class en domain/
3. TEST       → Unitario que valida el contrato
4. IMPLEMENTAR → Código en data/ y presentation/
5. REVISAR    → Verifica que cumple la spec punto por punto
```

**Ningún paso se salta. Si alguien dice "implementa X", respondemos:**
- ¿Existe spec de X en specs/?
- Si no: "Primero creo la spec"
- Si sí: Verificar contrato en domain/
- Recién entonces: implementar

### 1.2 Dónde Viven las Specs

```
specs/
├── features/
│   ├── parking/                    ← UseCase specs
│   │   ├── register-vehicle-entry.spec.md
│   │   ├── register-vehicle-exit.spec.md
│   │   ├── calculate-parking-fee.spec.md
│   │   ├── get-active-sessions.spec.md
│   │   └── search-vehicle-by-plate.spec.md
│   ├── monthly-plans/
│   ├── invoicing/
│   ├── payments/
│   ├── cashier/
│   ├── customers/
│   ├── reports/
│   └── auth/
├── components/                     ← Component specs
│   ├── vehicle-entry-form.spec.md
│   ├── active-sessions-table.spec.md
│   └── data-table.spec.md
└── infrastructure/                 ← Infrastructure specs
    └── offline-sync.spec.md
```

### 1.3 Template de Spec de UseCase

```markdown
# Spec: [Nombre]

## Identificador
`feature/usecase-name`

## Descripción
[Una oración clara]

## Actor
[Quién lo invoca: operario, admin, sistema, cliente]

## Pre-condiciones
- [Qué debe ser verdad antes]

## Input (Params)
| Campo | Tipo | Obligatorio | Validaciones |

## Output (Result)
| Caso | Tipo | Descripción |

## Reglas de Negocio
1. [Regla importante]
2. [Regla importante]

## Flujo Principal
1. [Paso 1]
2. [Paso 2]

## Edge Cases
- [Caso especial A]
- [Caso especial B]

## Dependencias
- `RepositoryX.method()`

## Mapping a UI
- **Invocación**: Page → Component → Button
- **Formulario**: ParkingForms.createXxxForm()
- **Feedback**: Toast éxito, Dialog error
```

### 1.4 Template de Spec de Componente

```markdown
# Spec: [Componente]

## Tipo
Dumb / Smart

## Selector
`app-[nombre]`

## Propósito
[Una oración]

## Inputs
| Input | Tipo | Default | Descripción |

## Outputs
| Output | Tipo | Cuándo emite |

## Estados Visuales
- Loading: [qué muestra]
- Empty: [qué muestra]

## Comportamiento
1. [Paso usuario]
2. [Reacción sistema]

## NO hace
- NO invoca UseCases directamente
- NO accede a BD
- NO importa data/
```

### 1.5 Template de Spec de Infraestructura

```markdown
# Spec: [Componente de Infra]

## Propósito
[Qué problema técnico resuelve]

## Interfaz Pública
[Métodos expuestos, contratos]

## Dependencias Externas
[APIs, librerías]

## Configuración
[Variables de .env]

## Manejo de Errores
[Estrategia]

## Consideraciones de Seguridad
[Tokens, datos sensibles]
```

---

## 2. ARQUITECTURA LIMPIA — REGLAS INQUEBRANTABLES

### 2.1 Las Tres Capas

```
Presentación (UI, formularios, pages)
        ↓
    Domain (lógica de negocio, interfaces, entidades)
        ↓
     Data (acceso a BD, datasources, mappers)
```

**Regla crítica**: Domain NUNCA importa Data ni Presentación.

```typescript
// ✓ CORRECTO
// en features/parking/domain/usecases/register-vehicle-entry.usecase.ts
import { ParkingRepository } from '../repositories/parking.repository';
import { ParkingSessionEntity } from '../entities/parking-session.entity';

// ✗ INCORRECTO
import { ParkingRemoteDataSource } from '../../data/datasources/...';  // NO!
import { MyComponent } from '../../presentation/components/...';  // NO!
```

### 2.2 Either Pattern

Todas las respuestas retornan `Either<Failure, Result>`. No hay exceptions para control de flujo.

```typescript
// Desde domain/usecases/register-vehicle-entry.usecase.ts
async execute(params): Promise<Either<Failure, ParkingSessionEntity>> {
  // Validar
  if (!isValidPlate(params.plate)) {
    return Left(new ValidationFailure('Placa inválida'));
  }
  
  // Buscar sesión activa (via repository)
  const existingSession = await this.repository.getSessionByPlate(params.plate);
  if (existingSession.isRight()) {
    return Left(new BusinessRuleFailure('Ya existe sesión activa'));
  }
  
  // Crear y retornar
  const session = new ParkingSessionEntity(...);
  return Right(session);
}
```

### 2.3 Entity vs Model vs DTO

- **Entity** (domain/entities): Lógica pura, camelCase, sin conocimiento de BD
  ```typescript
  class ParkingSessionEntity extends BaseEntity {
    vehiclePlate: string;
    entryAt: Date;
    status: 'active' | 'completed' | 'cancelled';
  }
  ```

- **Model** (data/models): Interfaz que refleja DTO de Supabase, snake_case
  ```typescript
  interface ParkingSessionModel {
    id: string;
    vehicle_plate: string;
    entry_at: string;  // ISO string
    status: string;
  }
  ```

- **Mapper**: Convierte entre Model ↔ Entity
  ```typescript
  class ParkingSessionMapper {
    static toEntity(model: ParkingSessionModel): ParkingSessionEntity {
      return new ParkingSessionEntity({
        id: model.id,
        vehiclePlate: model.vehicle_plate,
        entryAt: new Date(model.entry_at),
        ...
      });
    }
    
    static toModel(entity: ParkingSessionEntity): ParkingSessionModel {
      return {
        id: entity.id,
        vehicle_plate: entity.vehiclePlate,
        entry_at: entity.entryAt.toISOString(),
        ...
      };
    }
  }
  ```

### 2.4 UseCase Base

Todas las operaciones siguen este patrón:

```typescript
// core/base/usecase.ts
export abstract class UseCase<Params, Result> {
  abstract execute(params: Params): Promise<Either<Failure, Result>>;
}

export class NoParams {}

// features/parking/domain/usecases/register-vehicle-entry.usecase.ts
export class RegisterVehicleEntryUseCase 
  extends UseCase<RegisterVehicleEntryParams, ParkingSessionEntity> {
  
  constructor(
    @Inject(PARKING_REPOSITORY_TOKEN) 
    private parkingRepository: ParkingRepository
  ) {
    super();
  }
  
  async execute(params: RegisterVehicleEntryParams): 
    Promise<Either<Failure, ParkingSessionEntity>> {
    // implementación
  }
}
```

### 2.5 Repository Pattern

Cada feature tiene un repository abstracto en domain/repositories:

```typescript
// features/parking/domain/repositories/parking.repository.ts
export abstract class ParkingRepository {
  abstract registerEntry(plate: string, vehicleType: VehicleType): 
    Promise<Either<Failure, ParkingSessionEntity>>;
  abstract registerExit(plate: string): 
    Promise<Either<Failure, {session: ParkingSessionEntity, payment: PaymentEntity}>>;
  abstract getActiveSessions(filter?, pagination?, sort?): 
    Promise<Either<Failure, {data: ParkingSessionEntity[], pagination: Pagination}>>;
}
```

La implementación en data/repositories/parking.repository.impl.ts:

```typescript
export class ParkingRepositoryImpl extends ParkingRepository {
  constructor(
    @Inject(PARKING_REMOTE_DATASOURCE_TOKEN) 
    private remoteDs: ParkingRemoteDataSource,
    @Inject(PARKING_LOCAL_DATASOURCE_TOKEN)
    private localDs: ParkingLocalDataSource
  ) { super(); }
  
  async registerEntry(...): Promise<Either<Failure, ParkingSessionEntity>> {
    try {
      // Intentar remoto (Supabase)
      if (this.isOnline) {
        const result = await this.remoteDs.insertSession(...);
        if (result.isRight()) {
          // También guardar en local como backup
          await this.localDs.insertSession(result.value);
        }
        return result;
      } else {
        // Si offline, guardar solo en local
        return await this.localDs.insertSession(...);
      }
    } catch (error) {
      return Left(new ServerFailure(error.message));
    }
  }
}
```

### 2.6 DataSource Pattern

Cada repo tiene dos datasources: remoto (Supabase) y local (IndexedDB).

```typescript
// data/datasources/parking.datasource.ts (abstract)
export abstract class ParkingDataSource {
  abstract insertSession(data: ParkingSessionModel): 
    Promise<Either<Failure, ParkingSessionEntity>>;
  abstract updateSession(id: string, data: Partial<ParkingSessionModel>): 
    Promise<Either<Failure, ParkingSessionEntity>>;
}

// data/datasources/parking-remote.datasource.ts
export class ParkingRemoteDataSource extends ParkingDataSource {
  constructor(private supabase: SupabaseService) { super(); }
  
  async insertSession(data: ParkingSessionModel): Promise<...> {
    const { data: result, error } = 
      await this.supabase.from('parking_sessions').insert(data).single();
    if (error) return Left(new ServerFailure(error.message));
    return Right(ParkingSessionMapper.toEntity(result));
  }
}

// data/datasources/parking-local.datasource.ts (IndexedDB)
export class ParkingLocalDataSource extends ParkingDataSource {
  constructor(private powersync: PowerSyncService) { super(); }
  
  async insertSession(data: ParkingSessionModel): Promise<...> {
    const entity = await this.powersync.db.execute(
      'INSERT INTO parking_sessions (...) VALUES (...)',
      [...]
    );
    return Right(entity);
  }
}
```

### 2.7 Inyección de Dependencias

Cada módulo declara sus providers en un array de InjectionToken:

```typescript
// core/di/injection-tokens.ts
export const PARKING_REPOSITORY_TOKEN = 
  new InjectionToken<ParkingRepository>('ParkingRepository');
export const PARKING_REMOTE_DATASOURCE_TOKEN = 
  new InjectionToken<ParkingRemoteDataSource>('ParkingRemoteDataSource');
export const PARKING_LOCAL_DATASOURCE_TOKEN = 
  new InjectionToken<ParkingLocalDataSource>('ParkingLocalDataSource');

// En app.config.ts o feature module
export const parkingProviders = [
  {
    provide: PARKING_LOCAL_DATASOURCE_TOKEN,
    useClass: ParkingLocalDataSource
  },
  {
    provide: PARKING_REMOTE_DATASOURCE_TOKEN,
    useClass: ParkingRemoteDataSource
  },
  {
    provide: PARKING_REPOSITORY_TOKEN,
    useClass: ParkingRepositoryImpl
  },
  RegisterVehicleEntryUseCase,
  RegisterVehicleExitUseCase,
  // ...
];
```

---

## 3. ESTRUCTURA DE CARPETAS

```
src/app/
├── core/
│   ├── either/
│   │   ├── either.ts           ← Either<L, R> class + Left, Right
│   │   └── failures.ts         ← Failure base + subclases
│   ├── base/
│   │   ├── base.entity.ts       ← BaseEntity con id, createdAt, updatedAt
│   │   └── usecase.ts           ← UseCase<Params, Result> abstract
│   ├── di/
│   │   └── injection-tokens.ts ← Todos los InjectionTokens
│   ├── guards/
│   │   └── auth.guard.ts        ← Protege rutas
│   ├── interceptors/
│   │   └── error.interceptor.ts ← Manejo global de errores
│   └── services/
│       ├── supabase.service.ts  ← Cliente Supabase
│       └── network-info.service.ts ← Detecta online/offline
│
├── features/
│   ├── parking/
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   │   ├── parking-session.entity.ts
│   │   │   │   ├── vehicle.entity.ts
│   │   │   │   └── tariff.entity.ts
│   │   │   ├── repositories/
│   │   │   │   └── parking.repository.ts
│   │   │   └── usecases/
│   │   │       ├── register-vehicle-entry.usecase.ts
│   │   │       ├── register-vehicle-exit.usecase.ts
│   │   │       └── ... (más usecases)
│   │   ├── data/
│   │   │   ├── models/
│   │   │   │   ├── parking-session.model.ts
│   │   │   │   └── vehicle.model.ts
│   │   │   ├── datasources/
│   │   │   │   ├── parking.datasource.ts
│   │   │   │   ├── parking-remote.datasource.ts
│   │   │   │   └── parking-local.datasource.ts
│   │   │   └── repositories/
│   │   │       └── parking.repository.impl.ts
│   │   ├── presentation/
│   │   │   ├── pages/
│   │   │   │   ├── operator-dashboard.component.ts
│   │   │   │   └── parking-history.component.ts
│   │   │   ├── components/
│   │   │   │   ├── vehicle-entry-form.component.ts
│   │   │   │   ├── active-sessions-table.component.ts
│   │   │   │   └── vehicle-exit-dialog.component.ts
│   │   │   └── forms/
│   │   │       └── parking.forms.ts
│   │   └── parking.routes.ts    ← Rutas lazy-loaded
│   │
│   ├── monthly-plans/ (similar estructura)
│   ├── invoicing/
│   ├── payments/
│   ├── cashier/
│   ├── customers/
│   ├── reports/
│   └── auth/
│
├── shared/
│   ├── components/
│   │   ├── data-table/
│   │   ├── confirm-dialog/
│   │   ├── loading-spinner/
│   │   ├── error-display/
│   │   ├── plate-input/
│   │   ├── status-badge/
│   │   └── search-input/
│   ├── directives/
│   ├── pipes/
│   │   ├── currency-cop.pipe.ts       ← Formatea a COP
│   │   ├── time-ago.pipe.ts           ← "hace 5 min"
│   │   └── plate-format.pipe.ts       ← Normaliza placa
│   ├── forms/
│   │   ├── validators/
│   │   │   ├── plate.validator.ts
│   │   │   ├── nit.validator.ts
│   │   │   ├── colombian-phone.validator.ts
│   │   │   └── positive-number.validator.ts
│   │   └── form-error-messages.ts
│   ├── models/
│   │   ├── pagination.model.ts
│   │   ├── sort.model.ts
│   │   └── filter.model.ts
│   └── utils/
│       ├── date.utils.ts        ← UTC-5 Colombia
│       ├── currency.utils.ts
│       └── uuid.utils.ts
│
├── app.component.ts              ← Shell con router-outlet
├── app.config.ts                 ← Providers globales
└── app.routes.ts                 ← Rutas raíz con lazy loading

specs/                             ← TODAS LAS SPECS
├── features/
│   ├── parking/
│   ├── monthly-plans/
│   ├── invoicing/
│   ├── payments/
│   ├── cashier/
│   ├── customers/
│   ├── reports/
│   └── auth/
├── components/
└── infrastructure/
```

---

## 4. CONVENCIONES DE NAMING

| Tipo | Patrón | Ejemplo |
|---|---|---|
| Entity | `XxxEntity` | `parking-session.entity.ts` |
| Model (DTO) | `XxxModel` (interface) | `parking-session.model.ts` |
| Repository (contrato) | `XxxRepository` (abstract) | `parking.repository.ts` |
| Repository (impl) | `XxxRepositoryImpl` | `parking.repository.impl.ts` |
| DataSource (abstract) | `XxxDataSource` | `parking.datasource.ts` |
| DataSource (remote) | `XxxRemoteDataSource` | `parking-remote.datasource.ts` |
| DataSource (local) | `XxxLocalDataSource` | `parking-local.datasource.ts` |
| UseCase | `VerbNounUseCase` | `register-vehicle-entry.usecase.ts` |
| Page/Smart Component | descriptivo | `operator-dashboard.component.ts` |
| Dumb Component | descriptivo | `vehicle-entry-form.component.ts` |
| Service (Forms) | `XxxForms` | `parking.forms.ts` |
| Validator | `xxxValidator()` | `plate.validator.ts` |
| Failure | `XxxFailure` | dentro de `failures.ts` |
| Archivo | `kebab-case.tipo.ts` | `parking-session.entity.ts` |

---

## 5. FORMULARIOS REACTIVOS

Cada feature tiene un servicio `XxxForms` que centraliza la creación de FormGroups:

```typescript
// features/parking/presentation/forms/parking.forms.ts
import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Injectable({ providedIn: 'root' })
export class ParkingForms {
  constructor(private fb: FormBuilder) {}
  
  createEntryForm(): FormGroup {
    return this.fb.group({
      plate: ['', [Validators.required, plateValidator()]],
      vehicleType: ['', Validators.required],
      color: ['', [Validators.maxLength(50)]],
      brand: ['', [Validators.maxLength(50)]]
    });
  }
  
  createExitForm(): FormGroup {
    return this.fb.group({
      plate: ['', Validators.required],  // read-only
      vehicleType: ['', Validators.required],  // read-only
      paymentMethod: ['', Validators.required],
      justification: ['']  // condicional: required si method es 'cortesia'|'error'|'mensual'
    });
  }
}
```

**Regla**: Los componentes NO crean FormGroup directamente. Los inyectan via `XxxForms.create...()`.

```typescript
// features/parking/presentation/components/vehicle-entry-form.component.ts
export class VehicleEntryFormComponent implements OnInit {
  form: FormGroup;
  
  constructor(private parkingForms: ParkingForms) {}
  
  ngOnInit() {
    this.form = this.parkingForms.createEntryForm();  // ← así
  }
  
  // NO hacer:
  // this.form = this.fb.group({ ... });  ✗
}
```

---

## 6. ERRORES: FAILURES VS EXCEPTIONS

**No usamos throw/catch para control de flujo.**

```typescript
// Failures: para errores esperados/manejables
export abstract class Failure {
  constructor(public message: string) {}
}

export class ValidationFailure extends Failure {}
export class BusinessRuleFailure extends Failure {}
export class NotFoundFailure extends Failure {}
export class UnauthorizedFailure extends Failure {}
export class ServerFailure extends Failure {}
export class NetworkFailure extends Failure {}
export class CacheFailure extends Failure {}

// En UseCase
async execute(params): Promise<Either<Failure, Result>> {
  if (!isValidPlate(params.plate)) {
    return Left(new ValidationFailure('Placa inválida'));  // ← así
  }
}

// En Componente smart (consume UseCase)
async onSubmit() {
  const result = await this.usecase.execute(params);
  
  result.fold(
    (failure) => {
      // Mostrar error
      if (failure instanceof ValidationFailure) {
        this.showValidationError(failure.message);
      } else if (failure instanceof NetworkFailure) {
        this.showNetworkError();
      }
    },
    (success) => {
      // Continuar
      this.showSuccess();
    }
  );
}
```

---

## 7. PWA & OFFLINE FIRST

El proyecto es una PWA con soporte offline usando PowerSync:

- **Service Worker**: Angular SW en `ngsw-config.json`
- **Sincronización**: PowerSync para IndexedDB ↔ Supabase
- **Indicador de estado**: Badge online/offline en la UI

```typescript
// En cualquier componente smart
constructor(private networkInfo: NetworkInfoService) {
  this.isOnline$ = this.networkInfo.isOnline$;
}

// En template
<div class="status-bar" [class.offline]="!(isOnline$ | async)">
  <span *ngIf="!(isOnline$ | async)">
    ⚠️ Sin conexión. Cambios se sincronizarán automáticamente.
  </span>
</div>
```

---

## 8. FLUJO DE DESARROLLO: PASO A PASO

### Paso 1: Verificar Spec
```bash
# ¿Existe specs/features/parking/register-vehicle-entry.spec.md?
# Si no: crearla
# Si sí: leerla completa
```

### Paso 2: Crear Entities en Domain
```typescript
// features/parking/domain/entities/parking-session.entity.ts
export class ParkingSessionEntity extends BaseEntity {
  vehiclePlate: string;
  entryAt: Date;
  // ... etc según spec
}
```

### Paso 3: Crear Repository Contrato
```typescript
// features/parking/domain/repositories/parking.repository.ts
export abstract class ParkingRepository {
  abstract registerEntry(...): Promise<Either<Failure, ParkingSessionEntity>>;
}
```

### Paso 4: Crear UseCase
```typescript
// features/parking/domain/usecases/register-vehicle-entry.usecase.ts
export class RegisterVehicleEntryUseCase 
  extends UseCase<RegisterVehicleEntryParams, ParkingSessionEntity> {
  // Implementar según spec
}
```

### Paso 5: Crear Models & Mappers
```typescript
// features/parking/data/models/parking-session.model.ts
interface ParkingSessionModel { ... }
class ParkingSessionMapper { ... }
```

### Paso 6: Crear DataSources
```typescript
// features/parking/data/datasources/parking.datasource.ts (abstract)
// features/parking/data/datasources/parking-remote.datasource.ts (Supabase)
// features/parking/data/datasources/parking-local.datasource.ts (IndexedDB)
```

### Paso 7: Implementar Repository
```typescript
// features/parking/data/repositories/parking.repository.impl.ts
export class ParkingRepositoryImpl extends ParkingRepository {
  // Orquesta datasources remote + local
}
```

### Paso 8: Crear Componentes & Forms
```typescript
// features/parking/presentation/forms/parking.forms.ts
// features/parking/presentation/components/vehicle-entry-form.component.ts
// features/parking/presentation/pages/operator-dashboard.component.ts
```

### Paso 9: Escribir Tests
```bash
# tests/parking.usecase.spec.ts
# tests/parking.repository.spec.ts
# tests/vehicle-entry-form.component.spec.ts
```

### Paso 10: Revisar vs Spec
Verificar punto por punto que la implementación cumple la spec.

---

## 9. REGLAS DE NEGOCIO (REFERENCIA RÁPIDA)

1. **Una placa = una sesión activa** (constraint en BD + validación UseCase)
2. **Minutos de gracia**: Si sale antes de X minutos, no se cobra
3. **Tope diario**: Nunca se cobra más que el tope configurado
4. **Mensualidad**: Sesión gratis si está en vigencia
5. **Numeración de facturas**: Asignada por Edge Function, nunca por cliente
6. **Factura DIAN**: Requiere XML válido + firma XAdES + CUFE
7. **Offline-first**: Operación se guarda local, sincroniza cuando hay conexión
8. **Audit trail**: Todo cambio sensible queda registrado en BD

---

## 10. DEPLOYMENT & CI/CD

- **Front-end**: Vercel, Netlify o similar (Angular build → estática)
- **Service Worker**: Automático con `ng build` (incluye NGSW)
- **Backend**: Supabase (postgres + edge functions)
- **Microservicio FE**: Fly.io (Docker)

---

## PRÓXIMOS PASOS

1. ✅ Estructura de carpetas creada
2. ✅ Specs completas en specs/
3. ⏳ Implementar entities + repository contratos (domain/)
4. ⏳ Implementar datasources (data/)
5. ⏳ Implementar usecases (domain/usecases/)
6. ⏳ Implementar components + forms (presentation/)
7. ⏳ Tests para cada capa
8. ⏳ Integración con Supabase y PowerSync

---

**v1.0** — Fuente de verdad del proyecto. Actualizar ante cualquier decisión nueva.
