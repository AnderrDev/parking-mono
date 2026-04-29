#!/bin/sh
# UserPromptSubmit hook — recordatorio breve del marco en cada mensaje del usuario.
# Sobrevive a compactación: el modelo siempre ve la fase activa y las reglas.
# Output: JSON con hookSpecificOutput.additionalContext.

set -eu

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PLAN_FILE="$PROJECT_ROOT/PLAN.md"

# Extraer fase activa
fase_actual="(PLAN.md no encontrado)"
if [ -f "$PLAN_FILE" ]; then
  raw=$(grep -E '^\*\*Fase actual:\*\*' "$PLAN_FILE" | head -1 | sed 's/^\*\*Fase actual:\*\* *//' || true)
  [ -n "$raw" ] && fase_actual="$raw"
fi

# Recordatorio MUY corto (este se inyecta en cada mensaje; 4-5 líneas máximo)
contexto=$(cat <<EOF
[Marco parqueadero] Fase: $fase_actual · Reglas: (1) spec primero (créalo+confirma si falta); (2) tests en la misma sesión; (3) destructivos (git push, supabase --linked, fly deploy, rm -rf) requieren confirmación. Bitácora: actualiza sessions/YYYY-MM-DD-*.md al cerrar.
EOF
)

jq -n --arg ctx "$contexto" '{
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: $ctx
  }
}'
