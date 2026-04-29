#!/usr/bin/env bash
# Runner de tests RLS / triggers SQL.
# Uso: ./supabase/tests/run-rls-tests.sh
# Pre-requisito: supabase start (BD local en :54322).

set -uo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
TESTS_DIR="$(cd "$(dirname "$0")" && pwd)/rls"

if [ ! -d "$TESTS_DIR" ]; then
  echo "ERROR: tests dir no existe: $TESTS_DIR" >&2
  exit 1
fi

echo "Running RLS tests against $DB_URL"
echo

pass_count=0
fail_count=0
failed_tests=()

shopt -s nullglob
test_files=("$TESTS_DIR"/*.test.sql)
shopt -u nullglob

if [ ${#test_files[@]} -eq 0 ]; then
  echo "WARN: ningún archivo *.test.sql encontrado en $TESTS_DIR"
  exit 0
fi

for test_file in "${test_files[@]}"; do
  test_name="$(basename "$test_file")"
  echo "─── $test_name ───"

  output=$(PGPASSWORD=postgres psql "$DB_URL" -X -q -f "$test_file" 2>&1) && exit_code=0 || exit_code=$?
  echo "$output"

  if [ $exit_code -ne 0 ] || echo "$output" | grep -q "FAIL:"; then
    echo "❌ $test_name FAILED (exit=$exit_code)"
    failed_tests+=("$test_name")
    fail_count=$((fail_count + 1))
  else
    echo "✅ $test_name passed"
    pass_count=$((pass_count + 1))
  fi
  echo
done

echo "════════════════════════════════════════"
echo "Total: $((pass_count + fail_count)) | Pass: $pass_count | Fail: $fail_count"
if [ $fail_count -gt 0 ]; then
  echo "Failed:"
  for t in "${failed_tests[@]}"; do
    echo "  - $t"
  done
fi
echo "════════════════════════════════════════"

[ $fail_count -eq 0 ]
