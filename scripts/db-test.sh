#!/usr/bin/env bash
# Local migration + RLS test harness. Spins up a throwaway Postgres 16 cluster,
# loads a Supabase stand-in, the live baseline, two seeded creators that mirror
# production, every migration in order, then the RLS/ledger tests.
# Usage: scripts/db-test.sh            (needs postgres 16 binaries on PATH or in /usr/lib/postgresql/16/bin)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DATA="$(mktemp -d)"; PORT="${PORT:-55432}"
cleanup(){ "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
RUNAS=""; if [ "$(id -u)" = 0 ]; then chown -R postgres "$DATA" 2>/dev/null || { useradd -r postgres; chown -R postgres "$DATA"; }; RUNAS="runuser -u postgres --"; fi
$RUNAS "$PGBIN/initdb" -D "$DATA" -A trust -U postgres >/dev/null
$RUNAS "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" start >/dev/null
PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q -X"
$PSQL -c "create database sl" >/dev/null
run(){ echo "== $1"; $PSQL -d sl -f "$1"; }
run "$ROOT/supabase/tests/00_supabase_shim.sql"
run "$ROOT/supabase/baseline/0_live_schema_2026-11-19.sql"
run "$ROOT/supabase/tests/01_seed_like_production.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do run "$f"; done
echo "== re-running every migration to prove idempotency"
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -d sl -f "$f" >/dev/null; done
for f in "$ROOT"/supabase/tests/[1-9]*_test_*.sql; do run "$f"; done
echo "ALL DATABASE TESTS PASSED"
