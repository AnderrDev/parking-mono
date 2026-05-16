#!/usr/bin/env bash
# Runner de pen-test RLS — Fase 10 Sprint 10D.
# Uso: ./supabase/tests/pen-test/run-pen-test.sh
# Pre-requisitos:
#   - supabase start corriendo (Docker arriba).
#   - deno >= 1.40 instalado.
#   - SUPABASE_JWT_SECRET, SUPABASE_ANON_KEY, PENTEST_ADMIN_UID, PENTEST_OPERADOR_UID
#     exportados en el entorno.

set -uo pipefail

CASES_DIR="$(cd "$(dirname "$0")" && pwd)/cases"

if ! command -v deno > /dev/null; then
  echo "ERROR: deno no encontrado. Instalar: https://deno.land/" >&2
  exit 2
fi

if [ -z "${SUPABASE_JWT_SECRET:-}" ]; then
  echo "ERROR: SUPABASE_JWT_SECRET no seteado." >&2
  echo "  export SUPABASE_JWT_SECRET=\$(supabase status | grep 'JWT secret' | awk '{print \$3}')" >&2
  exit 2
fi

if [ -z "${PENTEST_ADMIN_UID:-}" ] || [ -z "${PENTEST_OPERADOR_UID:-}" ]; then
  echo "ERROR: PENTEST_ADMIN_UID y PENTEST_OPERADOR_UID deben estar exportados." >&2
  echo "  Verifica con: psql ... -c 'SELECT id, email, role FROM public.users;'" >&2
  exit 2
fi

shopt -s nullglob
test_files=("$CASES_DIR"/*.test.ts)
shopt -u nullglob

if [ ${#test_files[@]} -eq 0 ]; then
  echo "WARN: ningún case *.test.ts encontrado en $CASES_DIR"
  exit 0
fi

pass=0
fail=0
failed_cases=()

for tf in "${test_files[@]}"; do
  name="$(basename "$tf")"
  echo "▶ $name"
  if deno run --allow-net --allow-env "$tf"; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    failed_cases+=("$name")
  fi
  echo
done

echo "════════════════════════════════════════"
echo " Pen-test: $pass PASS, $fail FAIL"
echo "════════════════════════════════════════"

if [ "$fail" -gt 0 ]; then
  echo "Cases fallidos:"
  printf '  - %s\n' "${failed_cases[@]}"
  exit 1
fi
