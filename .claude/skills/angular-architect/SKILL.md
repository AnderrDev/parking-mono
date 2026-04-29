---
name: angular-architect
description: Angular 18+ expert for the parqueadero-web subproject. Use when writing or reviewing Angular code — components, services, forms, guards, routes, dependency injection, change detection, signals, RxJS — and when enforcing the project's clean architecture (domain/data/presentation) and Either<Failure, Result> patterns. Triggers on prompts like "implementa el componente X", "crea el usecase Y", "agrega el datasource Z", "Angular", "ng serve", paths under parqueadero-web/.
---

# angular-architect — Angular 18+ + Clean Architecture for parqueadero-web

You are working in `parqueadero-web/`. Read `parqueadero-web/CLAUDE.md` for the full convention table; this skill is the **operational checklist**.

## Hard Rules (do not violate)

1. **`domain/` never imports from `data/` or `presentation/`.** Verify imports before saving.
2. **Every operation returns `Either<Failure, Result>`.** No `throw` for control flow. UseCases, Repositories, DataSources — all of them.
3. **Standalone components only.** No `NgModule`s. `imports: [...]` on each component.
4. **One spec per feature/component before code.** Path: `parqueadero-web/specs/features/<feature>/<usecase>.spec.md` or `parqueadero-web/specs/components/<name>.spec.md`. If absent → create the spec first, confirm with user, then code.
5. **Forms via `XxxForms` service.** Components never call `FormBuilder` directly. Inject `ParkingForms`, call `createEntryForm()`.
6. **DI through `InjectionToken`s** (never string tokens, never `useFactory` unless required). Tokens live in `core/di/injection-tokens.ts`.

## Angular 18 Conventions (apply by default)

- **Signals** for component-local state (`signal()`, `computed()`, `effect()`). RxJS only for async streams (Supabase realtime, network status).
- **New control flow**: `@if`, `@for (item of items; track item.id)`, `@switch`. Do **not** use `*ngIf`/`*ngFor` in new code.
- **`input()` / `output()` / `model()` functions** for component IO, not `@Input()`/`@Output()` decorators.
- **`inject()` function** preferred over constructor injection inside class fields and functional guards/resolvers.
- **`ChangeDetectionStrategy.OnPush`** on every component. Combined with signals, this is automatic.
- **Lazy routes**: each feature exports `parking.routes.ts` and is registered with `loadChildren: () => import(...)`.
- **Functional guards/resolvers** (`CanActivateFn`), not class-based.
- **No `any`**. Use `unknown` and narrow.

## Layer Quick Reference

```
features/<feature>/
├── domain/
│   ├── entities/<x>.entity.ts        ← class extends BaseEntity, camelCase fields
│   ├── repositories/<x>.repository.ts ← abstract class, returns Either
│   └── usecases/<verb-noun>.usecase.ts ← extends UseCase<Params, Result>
├── data/
│   ├── models/<x>.model.ts            ← interface (snake_case, mirrors DB) + Mapper class
│   ├── datasources/
│   │   ├── <x>.datasource.ts          ← abstract
│   │   ├── <x>-remote.datasource.ts   ← Supabase
│   │   └── <x>-local.datasource.ts    ← PowerSync / IndexedDB
│   └── repositories/<x>.repository.impl.ts
└── presentation/
    ├── pages/<name>.component.ts       ← smart, orchestrates UseCases
    ├── components/<name>.component.ts  ← dumb, no UseCase, no BD
    └── forms/<feature>.forms.ts        ← @Injectable({providedIn:'root'})
```

## Implementation Order (when adding a feature)

1. **Spec** → `specs/features/<feature>/<usecase>.spec.md`. Use the template in `parqueadero-web/CLAUDE.md` §1.3.
2. **Entity** in `domain/entities/`. Extend `BaseEntity` (id, createdAt, updatedAt). camelCase fields.
3. **Repository contract** in `domain/repositories/` (abstract). Methods return `Promise<Either<Failure, X>>`.
4. **UseCase** in `domain/usecases/`. Validate params → call repository → return `Either`. Include unit test.
5. **Model + Mapper** in `data/models/`. snake_case interface + `XxxMapper.toEntity` / `.toModel`.
6. **DataSources** in `data/datasources/`: abstract → remote (Supabase) → local (PowerSync). Each method also returns `Either`.
7. **RepositoryImpl** in `data/repositories/`. Orchestrates remote+local based on `NetworkInfoService.isOnline()`. Online: write remote → mirror to local. Offline: local + queue for sync.
8. **Forms service** in `presentation/forms/`. Centralize all `FormGroup` factories.
9. **Dumb component** for the form/table (no UseCase injection).
10. **Smart page** for orchestration (inject UseCase, call `.execute()`, fold Either to UI feedback).
11. **DI registration** in `<feature>.routes.ts` `providers: []` or `app.config.ts`.

## Either Handling Pattern (consume in components)

```ts
const result = await this.registerEntry.execute({ plate, vehicleType });
result.fold(
  failure => {
    if (failure instanceof ValidationFailure) this.toast.error(failure.message);
    else if (failure instanceof BusinessRuleFailure) this.dialog.open(BusinessRuleDialog, { data: failure });
    else if (failure instanceof NetworkFailure) this.toast.warn('Guardado offline, se sincroniza luego');
    else this.toast.error('Error inesperado');
  },
  session => {
    this.toast.success(`${session.vehiclePlate} registrado a las ${this.timeFmt(session.entryAt)}`);
    this.router.navigate(['/parking/active']);
  }
);
```

## What NOT to do

- ❌ `*ngIf` / `*ngFor` in new templates (use `@if`/`@for`).
- ❌ `NgModule`. Standalone only.
- ❌ Try/catch as control flow. `Either` only.
- ❌ `FormBuilder` inside components.
- ❌ Importing `data/*` from `domain/*` (the architecture police will find you).
- ❌ Service-locator antipatterns. Always DI through `InjectionToken`.
- ❌ Subscribing to observables in templates without `async` pipe (or signals).
- ❌ `any`. Use `unknown` + type guards.

## Self-check before finishing

- [ ] Spec exists and covers what I implemented.
- [ ] No `domain/` file imports from `data/` or `presentation/`.
- [ ] Every async returns `Either<Failure, X>`.
- [ ] Component is `OnPush` and standalone.
- [ ] Form created via `XxxForms.createXxxForm()`.
- [ ] DI uses `InjectionToken`.
- [ ] At least one unit test for the UseCase exists or is queued.
