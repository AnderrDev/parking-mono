# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository State

This monorepo is **fully scaffolded but not yet implemented**. The directory tree exists (164 folders preserved by `.gitkeep`), all specs are written, and per-subproject CLAUDE.md files are complete — but there is **no code, no `package.json`, no `requirements.txt`, no migrations, and no git repo** yet. Treat the specs in each `specs/` directory and the three per-subproject `CLAUDE.md` files as the authoritative source of truth.

Do not invent commands or file layouts beyond what those docs prescribe. When asked to "implement X", first locate the relevant spec — if it does not exist, write the spec before any code (see Spec-Driven Development below).

## Monorepo Layout

Three independent subprojects, each with its own stack and its own `CLAUDE.md`:

| Subproject | Stack | Authoritative doc |
|---|---|---|
| `parqueadero-web/` | Angular 18 PWA, TypeScript, SCSS, PowerSync (offline-first) | `parqueadero-web/CLAUDE.md` |
| `parqueadero-backend/` | Supabase (PostgreSQL + RLS + Deno Edge Functions) | `parqueadero-backend/CLAUDE.md` |
| `dian-fe-service/` | Python 3.12 + FastAPI (DIAN electronic-invoicing microservice, deployed to Fly.io) | `dian-fe-service/CLAUDE.md` |

**Always read the relevant subproject's `CLAUDE.md` before working in it.** The root `README.md` has the cross-cutting overview; each subproject doc has the conventions, naming rules, and folder structure that apply only inside it.

## Spec-Driven Development (project-wide rule)

Nothing is implemented without a spec. The cycle is fixed:

```
1. SPEC       → write/update in <subproject>/specs/
2. CONTRATO   → interface / abstract class in domain/
3. TEST       → test that validates the contract
4. IMPLEMENT  → code in data/ and presentation/
5. REVIEW     → check against spec point by point
```

If a user asks to implement something and the spec does not exist, **create the spec first** and confirm before writing code. If a change diverges from the spec, **update the spec first**, not the code.

Specs already written (do not duplicate — extend these):
- `parqueadero-web/specs/features/parking/*.spec.md` (5 use cases)
- `parqueadero-web/specs/components/*.spec.md` (3 components)
- `parqueadero-web/specs/infrastructure/offline-sync.spec.md`
- `parqueadero-backend/specs/database-schema.spec.md`, `rls-policies.spec.md`
- `dian-fe-service/specs/{emit-invoice,cufe-calculation,xades-signature,dian-soap-integration}.spec.md`

## Clean Architecture (applies to all three subprojects)

Three layers, with one inviolable rule: **`domain/` never imports from `data/` or `presentation/`.**

```
Presentation (UI / FastAPI routes)
        ↓
    Domain  (entities, repository contracts, use cases)
        ↑
     Data   (models, datasources, repository implementations)
```

Shared patterns across the Angular and Python codebases:
- **`Either<Failure, Result>`** for all use-case and repository returns. No `throw`/`raise` for control flow. `Failure` has typed subclasses (`ValidationFailure`, `BusinessRuleFailure`, `NotFoundFailure`, `NetworkFailure`, `ServerFailure`, etc.).
- **Repository pattern**: abstract class in `domain/repositories/`, implementation in `data/repositories/`, two datasources (remote + local for the web app; real + mock for the Python service).
- **Entity vs Model**: `XxxEntity` (camelCase, domain) ↔ `XxxModel` (snake_case, mirrors DB DTO) ↔ `XxxMapper` (converts).
- **UseCase base class** with a single `execute(params) -> Either[Failure, Result]` method.

Naming and file conventions differ per subproject — see each `CLAUDE.md` (Angular uses `kebab-case.tipo.ts`, Python uses `snake_case.py`).

## Cross-Subproject Integration Flow

The three pieces wire together for the invoicing path; understand this before changing anything that touches invoices:

```
parqueadero-web (operator closes session)
        ↓ HTTPS + Supabase JWT
parqueadero-backend Edge Function `request-invoice`
  - assigns sequential invoice number (server-side, never client)
  - calls dian-fe-service POST /invoice
        ↓
dian-fe-service
  1. build UBL 2.1 XML
  2. compute CUFE (SHA-384 over 14 ordered fields, see cufe-calculation.spec.md)
  3. sign XAdES-EPES with .p12 cert
  4. POST to DIAN SOAP endpoint
  5. return {cufe, xml_url, pdf_url, dian_status}
        ↓
Edge Function updates `invoices` row in Supabase
        ↓
Web app shows operator the CUFE
```

Offline path: `parqueadero-web` writes locally to IndexedDB via PowerSync, then syncs to Supabase when online; the invoice round-trip only happens when connectivity returns.

## Non-Negotiable Business Rules

These are enforced in DB constraints, use cases, and RLS — keep them coherent across layers when changing anything related:

1. One plate = one active session at a time (`UNIQUE(vehicle_plate) WHERE status='active'`).
2. Grace minutes: no charge if exit before threshold.
3. Daily cap: never bill more than the configured ceiling.
4. Active monthly plan = free session.
5. Invoice numbering is server-assigned only (Edge Function), never by client.
6. DIAN invoicing is direct (no intermediary): valid UBL XML + XAdES signature + CUFE.
7. Offline-first: local write first, sync later.
8. Sensitive changes go to append-only `audit_log`.

## Commands

There is no code yet, so no build/test/lint commands run today. The commands documented in the `README.md` and per-subproject `CLAUDE.md` files describe what *will* work once each subproject has its dependencies installed:

```bash
# Web (after `npm install` in parqueadero-web/)
ng serve                    # dev server on :4200
ng test                     # Karma unit tests
ng build --configuration production

# Backend (after `npm install -g supabase`)
supabase start              # local Postgres + Edge Function runtime
supabase db push            # apply migrations to local
supabase db push --linked   # apply to linked remote project
supabase functions serve    # run Edge Functions locally
supabase functions deploy   # deploy to Supabase

# DIAN microservice (after `pip install -r requirements.txt`)
python -m uvicorn app.main:app --reload   # FastAPI dev server on :8000
pytest tests/test_cufe.py -v              # run a single test file
fly deploy                                # deploy to Fly.io
```

Do not run these against missing dependencies — verify the relevant `package.json` / `requirements.txt` / `supabase/config.toml` exists first. If a user asks to "set up" or "scaffold" a subproject, follow its CLAUDE.md's "Próximos pasos" ordering.

## Working In This Repo

- Operate inside one subproject at a time; cross-subproject changes (e.g. schema + Edge Function + Angular model) need spec updates in *all* affected `specs/` directories before code.
- This is not a git repo. Do not run `git` commands assuming history exists. If the user asks to initialize, they must opt in explicitly (`git init`).
- All in-code comments, specs, and user-facing copy are in **Spanish (Colombian context)**. Match that language when extending docs/specs; code identifiers stay English per the naming tables.
- Currency is stored as `*_cents` integers (COP). Times are UTC-5 (Colombia) — see `parqueadero-web/src/app/shared/utils/date.utils.ts` (planned).
