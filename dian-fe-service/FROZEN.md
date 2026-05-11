# 🧊 dian-fe-service — CONGELADO

**Estado:** CONGELADO desde 2026-04-29 (cierre de Fase 9 + decisión Fase 11).
**Razón:** la Fase 11 del plan principal reemplaza el camino DIAN directo por una integración con **Siigo** (SaaS). Siigo cubre UBL + firma XAdES + CUFE + transmisión a DIAN.

## Qué significa "congelado"

- El subproyecto **NO** recibe cambios funcionales nuevos.
- D1–D8 quedaron completados (107 tests pasando, Docker build OK) — código preservado como referencia o contingencia.
- D9 (deploy productivo) y D10 (hardening final) **nunca se completaron y no se completarán** mientras Siigo cubra la necesidad.
- Las specs en `specs/` describen el contrato DIAN directo y **no** corresponden con el contrato Siigo (Fase 11). No confundir.

## Cuándo se descongela

Solo en uno de estos escenarios:

1. Siigo deja de prestar el servicio o sube precio inviable.
2. Auditoría legal exige firma propia controlada por el operador.
3. Fly.io / contingencia DIAN exige microservicio propio.

En cualquiera de esos casos, antes de retomar trabajo:
- Revisar dependencias en `pyproject.toml` y `requirements.txt` (probable que estén desactualizadas).
- Re-verificar el `cert.p12` y endpoints DIAN (cambian con cada actualización del proveedor).
- Revisar specs en `specs/` y actualizarlas frente al estado actual de la DIAN.

## Reglas mientras esté congelado

- **No incluir en CI/CD** del monorepo. Si se agrega CI raíz, excluir explícitamente esta carpeta.
- **No actualizar dependencias automáticamente** — cualquier `pip install -U` debe ser deliberado.
- **No borrar la carpeta** sin acuerdo explícito; el código tiene valor como referencia y como respaldo de la lógica fiscal.

## Referencias

- `PLAN.md` raíz, sección "Cuándo entra `dian-fe-service` (histórico — **CONGELADO**)".
- `PLAN-DIAN.md` raíz: plan original.
- Decisiones Fase 11: `~/.claude/plans/vamos-a-hacer-una-purring-meadow.md` (plan Siigo aprobado).
