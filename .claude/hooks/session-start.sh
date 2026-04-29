#!/bin/sh
# SessionStart hook — inyecta el marco de trabajo del proyecto al iniciar sesión.
# Lee la "Fase actual" de PLAN.md, la última entrada de sessions/, y los recordatorios.
# Output: JSON con hookSpecificOutput.additionalContext que el harness inyecta en el contexto del modelo.

set -eu

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PLAN_FILE="$PROJECT_ROOT/PLAN.md"
SESSIONS_DIR="$PROJECT_ROOT/sessions"

# Extraer "**Fase actual:**" de PLAN.md
fase_actual="(PLAN.md no encontrado)"
if [ -f "$PLAN_FILE" ]; then
  raw=$(grep -E '^\*\*Fase actual:\*\*' "$PLAN_FILE" | head -1 | sed 's/^\*\*Fase actual:\*\* *//' || true)
  [ -n "$raw" ] && fase_actual="$raw"
fi

# Última sesión: ordenamos lexicográficamente (prefijo YYYY-MM-DD garantiza orden cronológico)
ultima_sesion="(ninguna — empieza creando sessions/$(date +%Y-%m-%d)-<slug>.md)"
if [ -d "$SESSIONS_DIR" ]; then
  candidato=$(ls -1 "$SESSIONS_DIR"/[0-9][0-9][0-9][0-9]-*.md 2>/dev/null | sort | tail -1 || true)
  if [ -n "$candidato" ]; then
    ultima_sesion="${candidato#$PROJECT_ROOT/}"
  fi
fi

# Construye el bloque de contexto que ve el modelo
contexto=$(cat <<EOF
[Marco de trabajo del proyecto parqueadero — inyectado por SessionStart hook]

📍 Fase actual: $fase_actual
📓 Última sesión: $ultima_sesion

🔒 Reglas absolutas:
1. Spec primero. Antes de codear, verifica que el spec existe. Si falta, CRÉALO y CONFIRMA con el usuario antes de avanzar a código.
2. Acciones destructivas (git push, supabase db push --linked, fly deploy, rm -rf, git reset --hard) requieren CONFIRMACIÓN previa del usuario.

📋 Protocolo al iniciar:
1. Lee la sección de la fase activa en PLAN.md.
2. Lee la última entrada en sessions/ para recuperar contexto.
3. Lee specs y sub-CLAUDE.md del subproyecto donde trabajarás.
4. Crea sessions/$(date +%Y-%m-%d)-<slug>.md para esta sesión (plantilla en sessions/README.md).
5. Invoca skills relevantes según la fase: angular-architect, supabase-expert, frontend-quality, ui-ux-parqueadero.
EOF
)

# Emite JSON. additionalContext entra al modelo; suppressOutput evita ruido en transcript.
jq -n --arg ctx "$contexto" '{
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $ctx
  }
}'
