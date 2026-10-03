#!/usr/bin/env bash
# Runs the SQL test-suite against a throwaway local PostgreSQL database.
# Usage: npm run test:db   (requires a local PostgreSQL server; PGHOST/PGUSER respected)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${TEST_DB:-apu_attendance_test}"
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
dropdb --if-exists "$DB" >/dev/null 2>&1 || true
createdb "$DB"
"${PSQL[@]}" -d "$DB" -f supabase/tests/00_local_supabase_stub.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -d "$DB" -f "$f"; done
"${PSQL[@]}" -d "$DB" -f supabase/seed.sql
"${PSQL[@]}" -d "$DB" -f supabase/seed.sql   # idempotency check
"${PSQL[@]}" -d "$DB" -f supabase/dev/dummy_students.sql
status=0
for t in supabase/tests/[1-9]*_test.sql; do
  echo "▶ $t"
  if ! "${PSQL[@]}" -d "$DB" -f "$t"; then status=1; fi
done
echo "▶ API integration tests (Netlify handlers -> SQL)"
if ! PGUSER="${PGUSER:-$(whoami)}" PGHOST="${PGHOST:-/var/run/postgresql}" TEST_DATABASE_URL="postgresql:///$DB" \
     npx vitest run tests/integration; then status=1; fi
[ "${KEEP_DB:-0}" = "1" ] || dropdb "$DB"
if [ $status -eq 0 ]; then echo "✔ all SQL tests passed"; else echo "✘ SQL tests failed"; fi
exit $status
