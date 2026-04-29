# Sesión: Fase 0 — Bootstrap (web + backend)

**Fecha:** 2026-04-28
**Subproyecto(s):** parqueadero-web, parqueadero-backend, root
**Estado:** completada (commit pendiente de confirmar con el usuario)

## Objetivos
- [x] `.gitignore` + `.editorconfig` raíz
- [x] Actualizar Angular CLI global a 18
- [x] `ng new` dentro de `parqueadero-web/` (preserva `CLAUDE.md` + `specs/`)
- [x] Instalar deps web (Supabase, PowerSync, Material/CDK pinned 18, lucide, date-fns)
- [x] `ng add @angular/pwa` + ESLint + Prettier
- [x] Endurecer `tsconfig.json`, budgets `angular.json`, scripts en `package.json`, `.env.example`, `.prettierrc`
- [x] `supabase init` + ajustar `config.toml` (jwt_expiry, minimum_password_length)
- [x] `.env.example` backend
- [x] DoD: web arranca en :4200 (HTTP 200), `supabase start` levanta (API :54321 OK), `npm run lint` pasa
- [ ] Commit + handoff a Fase 1 *(commit pendiente confirmación del usuario)*

## Contexto
Phase 0 del PLAN.md. La sesión anterior (`2026-04-28-init-claude-md-y-skills.md`) había inicializado git y skills, pero faltaban los scaffolds reales (Angular y Supabase) y la config base.

**Decisiones del usuario (vía AskUserQuestion):**
1. Actualizar Angular CLI global a 18 (era 17.3.10).
2. Proceder con ambos scaffolds (`ng new` + `supabase init`).
3. Solo Supabase local con Docker (sin link remoto en Fase 0).

## Avance
1. **Auditoría inicial**: `git init` ya existía con 2 commits previos; skills locales y plugin instalados; `parqueadero-backend/supabase/{migrations,functions}/` existían solo con `.gitkeep`. Faltaban `.gitignore`/`.editorconfig` raíz, todos los scaffolds y la config.
2. **`/.gitignore`**: añadidos node_modules, .env*, dist/, .angular/, supabase/.branches/, supabase/.temp/, .powersync/, coverage/, OS files, IDE files, Python (.venv, __pycache__), pem/p12.
3. **`/.editorconfig`**: utf-8/lf/2-space, override .py=4, override Makefile=tab, override *.md sin trim trailing.
4. **Angular CLI 18.2.21** instalado globalmente (`npm i -g @angular/cli@18`, ~8s).
5. **`parqueadero-web` scaffold**:
   - Limpié `src/` (.gitkeep tree de 164 carpetas, autorizado por usuario).
   - `ng new parqueadero-web --directory=. --skip-git --style=scss --routing --ssr=false --package-manager=npm --strict --defaults` (la sintaxis `ng new .` falla en CLI 18 — schema regex no acepta `.` como nombre).
   - `CLAUDE.md` y `specs/` preservados intactos.
6. **Deps web**: `@supabase/supabase-js`, `@angular/cdk@18`, `@angular/material@18` (sin pin a `@18` el resolver coge v21 que requiere Angular 21 → ERESOLVE), `lucide-angular`, `date-fns`, `date-fns-tz`, `@powersync/web` (en lugar de `@journeyapps/powersync-sdk` que está deprecado).
7. **PWA + ESLint + Prettier**: `ng add @angular/pwa@18` (genera ngsw-config.json, manifest, icons), `ng add @angular-eslint/schematics@18` (eslint.config.js flat), `npm i -D prettier eslint-config-prettier`, e integrado `prettierConfig` como último spread en `eslint.config.js`.
8. **Endurecimiento tsconfig**: añadidos `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true` (el resto de strict flags ya venían por scaffold).
9. **Budgets**: bajados a 250kB warn / 350kB error (initial). `anyComponentStyle` subido a 4kB/8kB.
10. **Scripts package.json**: `format`, `format:check`, `analyze` (con `dist/parqueadero-web/browser/*.js` que es la ruta real Angular 18).
11. **`.env.example` web** con SUPABASE_URL, SUPABASE_ANON_KEY, POWERSYNC_URL, DIAN_FE_SERVICE_URL.
12. **`.prettierrc`** con singleQuote, trailingComma=all, parser=angular para html, sin singleQuote en scss.
13. **`supabase init`** en `parqueadero-backend/` (acepta defaults; declina prompts de Deno VS Code/IntelliJ). Genera `config.toml` (12.4 kB).
14. **`config.toml` ajustes**: `minimum_password_length: 6 → 8`. `jwt_expiry=3600` ya venía. `db.major_version=17` (default actual; PLAN sugería 15/16 pero 17 es lo que cloud asume hoy).
15. **`.env.example` backend**: SUPABASE_DB_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DIAN_FE_SERVICE_URL, WOMPI_PUBLIC_KEY/PRIVATE_KEY.
16. **DoD ejecutado**:
   - `npm run lint`: All files pass linting ✓
   - `npm start` (background): bundle initial 113.14 kB (muy bajo el budget 250 kB), compiló en 1.2s; `curl http://localhost:4200` → HTTP 200 ✓
   - `docker info` falló → lancé Docker Desktop y esperé hasta que el daemon respondiera
   - `supabase start`: pulled studio image, started successfully. API :54321, Studio :54323, DB :54322. JWT secret + anon key + service_role key impresos.
   - `supabase status | grep "API URL"` → match ✓
   - `supabase stop` ✓ (datos persistidos en docker volume)
   - `git log --oneline | wc -l` → ya cumplía con commits previos.

## Decisiones
- **PowerSync rebrand**: PLAN.md decía `@journeyapps/powersync-sdk` (deprecado). El paquete actual es `@powersync/web`. PLAN actualizado en la sección Fase 0 para reflejarlo. *Riesgo futuro:* el código de Fase 8 (`offline-sync.spec.md`) puede tener referencias al SDK viejo — revisar al iniciar Fase 8.
- **`ng new .` no funciona en CLI 18**: el schema valida `name` contra regex npm. Solución: `ng new <nombre> --directory=. --skip-git ...`. PLAN actualizado.
- **`@angular/cdk` y `@angular/material` requieren pin `@18`**: el default coge v21 (peer Angular ≥21) y rompe ERESOLVE. PLAN actualizado.
- **`config.toml` no tiene `[functions] verify_jwt`** en Supabase CLI 2.34+. Se configura por función al `supabase functions deploy --no-verify-jwt` (default ON). PLAN actualizado.
- **`db.major_version=17`** (default de `supabase init`) en lugar de 15/16 que sugería el PLAN. Es lo que Supabase Cloud asume hoy al crear proyecto nuevo, y trabajamos solo local. Si el proyecto cloud futuro está en 15/16 hay que rebajar.
- **Anyone componentStyle budget 4kB/8kB** en lugar del default 2kB/4kB — los componentes con tablas + estados de POS suelen pasarse de 2kB con tokens normales. Margen razonable, no laxo.
- **Skills consultados**: aunque PLAN dice "Skills: ninguno" para Fase 0, las decisiones de tsconfig/budgets/config.toml se alinearon mentalmente con `angular-architect`, `supabase-expert`, `frontend-quality` para evitar reabrir en fases posteriores.

## Bloqueos / Pendientes
- **Commit pendiente**: la confirmación del primer `git commit` por la regla absoluta del PLAN (#4) requiere ok del usuario antes de ejecutar.
- **CLI Supabase desactualizado**: instalada 2.34.3, hay 2.95.4 disponible. No bloquea Fase 0; considerar `brew upgrade supabase/tap/supabase` cuando convenga.
- **47 vulnerabilidades npm audit** (6 low, 13 moderate, 28 high). Casi todas en deps transitivas de tooling. No bloquea Fase 0; `npm audit` revisable al final de Fase 10.

## Next Steps
- [ ] **Confirmar y ejecutar commit de Fase 0** (mensaje propuesto: `chore: bootstrap web (Angular 18 PWA) + backend (Supabase) + tooling base`).
- [ ] **Iniciar Fase 1 — Backend foundation**:
  1. Crear `sessions/2026-04-29-fase-1-schema-rls.md` (o fecha del día).
  2. Leer `parqueadero-backend/specs/database-schema.spec.md` y `rls-policies.spec.md` íntegros.
  3. Invocar skill `supabase-expert`.
  4. Migration `00001_extensions_and_helpers.sql` (pgcrypto, set_updated_at, audit_log + write_audit_log, invoice_number_seq, RLS audit_log).
  5. Migration `00002_initial_schema.sql` (11 tablas, índices, constraints únicos).
  6. Migration `00003_rls_policies.sql` (FORCE ROW LEVEL SECURITY + policies por rol).
  7. Migration `00004_triggers.sql` (set_updated_at + audit + assign_invoice_number).
  8. `seed.sql` con tarifas default; pedir email del admin de dev al usuario (no inventar).
  9. `supabase/tests/rls/*.sql` con SET LOCAL request.jwt.claims por rol.

## Notas para el siguiente Claude
- **PowerSync**: usar `@powersync/web`, NO `@journeyapps/powersync-sdk`. La spec de Fase 8 puede mencionar el viejo — actualizar.
- **Angular CLI 18**: `ng new .` falla, usa `--directory=.`. Ya no hay flags `--standalone` ni `--strict` (son default).
- **CDK/Material**: SIEMPRE pin `@18` o coge v21 e ERESOLVE.
- **Supabase verify_jwt**: per-función vía `supabase functions deploy --no-verify-jwt`; no hay flag global en config.toml moderno.
- **Bundle inicial actual**: 113 kB (gzip más bajo). El presupuesto 250 kB tiene margen amplio para Fase 2 (design system + shared components).
- **Docker**: el daemon no estaba corriendo; en futuras sesiones de backend, `open -a Docker` antes de `supabase start` y poll con `until docker info >/dev/null 2>&1; do sleep 2; done`.
- **`config.toml` Bogota timezone**: NO se setea aquí (es a nivel BD). Se hace en migration de Fase 1 con `ALTER DATABASE postgres SET timezone TO 'America/Bogota';` o se maneja siempre con `AT TIME ZONE 'America/Bogota'` en queries (preferido del PLAN).

## Prompt de handoff para Fase 1
> Bootstrap listo. Iniciar **Fase 1 — Backend foundation**. Lee `parqueadero-backend/specs/database-schema.spec.md` y `parqueadero-backend/specs/rls-policies.spec.md` completos antes de tocar SQL. Invoca skill `supabase-expert`. Crea `sessions/YYYY-MM-DD-fase-1-schema-rls.md`. Recuerda: `db.major_version=17`, password mínimo 8, jwt_expiry 3600, audit_log inmutable, invoice_number_seq sequence. Para correr supabase local, primero `open -a Docker` y poll daemon. Pedir al usuario email del admin de dev — no inventar.
