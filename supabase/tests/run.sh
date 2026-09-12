#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Corre las pruebas de RLS contra un Postgres local, sin Supabase ni Docker.
#
#   ./supabase/tests/run.sh
#
# Levanta un cluster efímero, emula lo mínimo de Supabase (roles anon /
# authenticated / service_role, esquema auth, auth.uid()), aplica las
# migraciones en orden y verifica 31 afirmaciones sobre las políticas.
#
# Requiere: postgresql-16 instalado. No toca tu proyecto de Supabase.
# -----------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS="$HERE/../migrations"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DATA="${PGDATA_TEST:-/var/lib/postgresql/coladb}"
PORT="${PGPORT_TEST:-5433}"
SOCK="${PGSOCK_TEST:-/tmp}"

psql_run() { psql -h "$SOCK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 "$@"; }

if ! psql_run -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "==> levantando Postgres en :$PORT"
  rm -rf "$DATA"; mkdir -p "$DATA"
  chown postgres:postgres "$DATA"; chmod 700 "$DATA"
  su postgres -c "$PGBIN/initdb -D $DATA -U postgres --auth=trust" >/dev/null
  su postgres -c "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k $SOCK' -l /tmp/pg.log start" >/dev/null
  sleep 2
fi

echo "==> base limpia"
psql_run -d postgres -q -c "drop database if exists cola;" >/dev/null
psql_run -d postgres -q -c "create database cola;" >/dev/null

echo "==> emulando Supabase"
psql_run -d cola -q -f "$HERE/00_supabase_shim.sql"

echo "==> aplicando migraciones"
for f in "$MIGRATIONS"/*.sql; do
  echo "    $(basename "$f")"
  psql_run -d cola -q -f "$f"
done

echo "==> pruebas de RLS"
psql_run -d cola -f "$HERE/01_rls_tests.sql"
