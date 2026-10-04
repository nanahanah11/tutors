#!/usr/bin/env bash
# Full local end-to-end run (no Supabase/Netlify account needed):
#   fresh PostgreSQL DB with migrations + seed + dummy students
#   -> PostgREST (lecturer RLS path)  -> Vite + real Netlify handlers  -> Playwright (Chromium)
# Requires: local PostgreSQL, Playwright + Chromium. PostgREST is downloaded on first run.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGUSER="${PGUSER:-$(whoami)}" PGHOST="${PGHOST:-/var/run/postgresql}"
export PGOPTIONS="-c client_min_messages=warning"
DB="${E2E_DB:-apu_attendance_e2e}"
OUT="${E2E_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"
CACHE=node_modules/.cache/postgrest
JWT_SECRET="local-e2e-jwt-secret-$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')"
PORT=5179
pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

if [ ! -x "$CACHE/postgrest" ]; then
  mkdir -p "$CACHE"
  curl -sSL -o "$CACHE/pgrst.tar.xz" https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
  tar -xf "$CACHE/pgrst.tar.xz" -C "$CACHE"
fi

dropdb --if-exists --force "$DB" >/dev/null 2>&1 || true
createdb "$DB"
P=(psql -v ON_ERROR_STOP=1 -q -X -d "$DB")
"${P[@]}" -f supabase/tests/00_local_supabase_stub.sql
for f in supabase/migrations/*.sql; do "${P[@]}" -f "$f"; done
"${P[@]}" -f supabase/seed.sql
"${P[@]}" -f supabase/dev/dummy_students.sql
"${P[@]}" -c "alter role authenticator password 'authpw';
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000a1da', 'aida@apu.edu.my');
  insert into profiles (auth_user_id, full_name, role) values ('00000000-0000-0000-0000-00000000a1da', 'Ms Aida', 'lecturer');"

cat > "$OUT/pgrst.conf" <<CONF
db-uri = "postgres://authenticator:authpw@localhost:5432/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-port = 3001
CONF
"$CACHE/postgrest" "$OUT/pgrst.conf" > "$OUT/postgrest.log" 2>&1 & pids+=($!)

ANON=$(JWT_SECRET=$JWT_SECRET node tests/e2e/jwt.mjs anon)
SERVICE=$(JWT_SECRET=$JWT_SECRET node tests/e2e/jwt.mjs service_role)
JWT_SECRET=$JWT_SECRET node tests/e2e/jwt.mjs authenticated 00000000-0000-0000-0000-00000000a1da aida@apu.edu.my > "$OUT/lect.jwt"

TEST_DATABASE_URL="postgresql:///$DB" POSTGREST_URL=http://localhost:3001 PORT=$PORT \
  VITE_SUPABASE_URL=http://localhost:$PORT VITE_SUPABASE_PUBLISHABLE_KEY="$ANON" \
  npx tsx tests/e2e/server.ts > "$OUT/server.log" 2>&1 & pids+=($!)
for _ in $(seq 1 40); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 0.5; done

# Deployment CLI scripts against the same stack (service role through PostgREST)
export VITE_SUPABASE_URL=http://localhost:$PORT SUPABASE_SERVICE_ROLE_KEY="$SERVICE" TUTOR_CODE_PEPPER=e2e-pepper-0123456789
echo "▶ CLI: import roster (preview + commit)"
npx tsx scripts/import-roster.ts tests/e2e/fixtures/cli_roster.csv --module CT046-3-2-SDM --commit | tail -6
echo "▶ CLI: generate tutor passwords"
npx tsx scripts/generate-tutor-passwords.ts | tee "$OUT/passwords.txt" | sed -E 's/[A-Za-z2-9]{8}$/<hidden>/'
awk '$2=="MAY" {printf "{\"username\":\"%s\",\"password\":\"%s\"}", $2, $3}' "$OUT/passwords.txt" > "$OUT/may-login.json"
"${P[@]}" -c "delete from tutor_code_attempts"

export E2E_OUT="$OUT" E2E_DB="$DB"
echo "▶ Tutor E2E";    node tests/e2e/tutor.e2e.cjs
echo "▶ Lecturer E2E"; node tests/e2e/lecturer.e2e.cjs
echo "✔ E2E passed – screenshots in $OUT"
