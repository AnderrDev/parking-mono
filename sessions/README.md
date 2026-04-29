# sessions/ — Bitácora de Trabajo

Carpeta de bitácoras: **una entrada por sesión de trabajo** para que cualquier agente (humano o Claude) recupere contexto rápidamente sin re-leer todo el repo.

## Cuándo crear una entrada

- Al empezar una sesión nueva con un objetivo concreto (ej. "implementar `RegisterVehicleEntryUseCase`", "crear migration inicial de schema", "añadir firma XAdES").
- No cada cambio menor. Una sesión = un objetivo (o un grupo cohesivo).
- Al terminar la sesión, **cerrar la entrada** con `## Next Steps` para la próxima vez.

## Convención de nombre

```
sessions/YYYY-MM-DD-<slug-corto>.md
```

Ejemplos:
- `2026-04-28-init-claude-md-y-skills.md`
- `2026-04-29-parking-domain-entities.md`
- `2026-05-02-supabase-schema-inicial.md`

Si hay varias sesiones el mismo día, sufijar `-2`, `-3`.

## Estructura mínima

Copia esta plantilla al crear una nueva entrada:

```markdown
# Sesión: <Título>

**Fecha:** YYYY-MM-DD
**Subproyecto(s):** parqueadero-web | parqueadero-backend | dian-fe-service | root
**Estado:** en progreso | completada | bloqueada

## Objetivos
- [ ] Objetivo concreto y verificable
- [ ] ...

## Contexto
Por qué hacemos esto ahora. Qué specs aplican. Qué se asume.

## Avance
Lo que se hizo, en orden. Incluye paths relativos a archivos tocados.

## Decisiones
Decisiones no obvias y su razón. (Las obvias no van.)

## Bloqueos / Pendientes
Lo que no se pudo cerrar y por qué.

## Next Steps
- [ ] Lo siguiente, idealmente con archivo/función específica
- [ ] ...

## Notas para el siguiente Claude
Cosas que ahorran tiempo: gotchas, comandos que sí/no funcionan, links a specs relevantes.
```

## Reglas

1. **No duplicar specs ni `CLAUDE.md`**. La bitácora dice "qué pasó esta sesión", no "cómo funciona el sistema". Si descubres una regla del sistema, va al `CLAUDE.md` correspondiente y la bitácora solo la referencia.
2. **No commits a la bitácora hasta cerrar la sesión** (deja `Estado: en progreso` durante el trabajo).
3. **Fechas absolutas siempre** (`2026-04-28`, no "ayer").
4. Mantén las entradas **cortas** — si una sesión necesita >300 líneas, probablemente eran varias sesiones.

## Índice rápido

Mantén actualizado el índice cronológico abajo (más reciente arriba):

- [2026-04-28 — Fase 0: Bootstrap (web + backend)](./2026-04-28-fase-0-bootstrap.md)
- [2026-04-28 — Init CLAUDE.md raíz + skills + bitácora](./2026-04-28-init-claude-md-y-skills.md)
