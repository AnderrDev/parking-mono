# Sesión: Init CLAUDE.md raíz + skills + bitácora

**Fecha:** 2026-04-28
**Subproyecto(s):** root
**Estado:** completada

## Objetivos
- [x] Crear `CLAUDE.md` raíz que orqueste los 3 sub-CLAUDE.md ya existentes
- [x] Instalar skills locales para Angular, frontend, UI/UX y Supabase
- [x] Establecer convención de bitácora por sesión en `sessions/`
- [x] Crear `PLAN.md` con roadmap de 10 fases para web + backend (DIAN aparte)

## Contexto
El proyecto está **scaffolded pero sin código** (164 carpetas con `.gitkeep`, 15 specs, 4 CLAUDE.md por sub-repo, sin `package.json`, `requirements.txt`, migrations ni git init). Antes de empezar a implementar features, necesitábamos:
1. Un punto de entrada raíz para futuras sesiones de Claude.
2. Skills que carguen contexto sobre Angular 18, Supabase, UI/UX para parqueadero (POS-style operator) y frontend quality.
3. Un mecanismo persistente de progreso entre sesiones, ya que aún no hay git.

## Avance
1. **Análisis del repo**: leído `README.md`, `PROYECTO_INICIADO.txt`, los 3 `CLAUDE.md` por subproyecto. Confirmado que solo existen specs + scaffolding.
2. **`CLAUDE.md` raíz** (`/CLAUDE.md`): orienta a futuros Claude sobre el estado scaffolded, apunta a los sub-CLAUDE.md como autoridad, resume el flujo cross-subproject de facturación (web → Edge Function → DIAN), y deja claro que comandos `ng serve`, `supabase start`, `uvicorn` aún no funcionan hasta instalar dependencias.
3. **Skills locales** en `.claude/skills/`:
   - `angular-architect/SKILL.md` — Angular 18+ standalone, signals, control flow, DI con InjectionTokens, formularios via `XxxForms`, capa limpia.
   - `supabase-expert/SKILL.md` — RLS, migrations, Edge Functions Deno, JWT claims, triggers para audit log y numeración secuencial.
   - `frontend-quality/SKILL.md` — A11y, Core Web Vitals, semantic HTML, responsive, TS strict.
   - `ui-ux-parqueadero/SKILL.md` — UX POS-style para operario: touch targets grandes, estados claros (entrada/salida/cobro/offline), feedback inmediato.
4. **Bitácora** (`sessions/README.md` + esta entrada): convención + plantilla + índice cronológico.
5. **Update `CLAUDE.md` raíz**: añadida sección "Working Aids" apuntando a `sessions/` y `.claude/skills/`.

## Decisiones
- **Skills locales en `.claude/skills/`, no globales** (`~/.claude/skills/`). Razón: son específicos del stack y reglas de negocio de este proyecto (Angular 18 + clean architecture + reglas DIAN + UX de parqueadero colombiano). No queremos que se apliquen en otros repos.
- **No duplicar el skill `frontend-design` ya disponible**. El nuestro `ui-ux-parqueadero` es complementario y enfocado en flujos POS-de-operario, no en diseño general de marketing/landing.
- **Skill triggers en español + inglés** para que dispare con prompts en cualquier idioma.
- **`sessions/` no es `docs/`**. Es bitácora cronológica; la documentación viva sigue en `CLAUDE.md` y `specs/`.

## Bloqueos / Pendientes
Ninguno.

## Next Steps
- [x] Crear `PLAN.md` raíz con 10 fases para web + backend (DIAN aparte). → ver `/PLAN.md`.
- [ ] Iniciar **Fase 0 — Bootstrap** (git init, `ng new`, `supabase init`). Crear nueva sesión `2026-04-29-fase-0-bootstrap.md`.

## Notas para el siguiente Claude
- **Lee primero el `CLAUDE.md` raíz**, después el del subproyecto donde vayas a trabajar. Cada uno tiene su propia tabla de naming.
- **No hay git todavía**. No corras `git status`/`git log` esperando historia. Si el usuario pide commits, primero `git init`.
- **Los specs son ley**. Antes de tocar `parking_sessions` mira `parqueadero-backend/specs/database-schema.spec.md`. Antes de tocar el CUFE mira `dian-fe-service/specs/cufe-calculation.spec.md`.
- **Idioma**: comentarios, specs, copy de UI en español (Colombia). Identificadores en inglés.
- **Dinero en `*_cents`** (enteros COP), tiempos en UTC-5.
