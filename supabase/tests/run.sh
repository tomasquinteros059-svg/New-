#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Pruebas de la base de datos, sin Supabase y sin Docker.
#
#   ./supabase/tests/run.sh
#
# Levanta un Postgres efímero, emula lo mínimo de Supabase (roles anon /
# authenticated / service_role, esquema auth, auth.uid()), y corre cada juego
# de pruebas contra una base RECIÉN CREADA, para que ninguno dependa del
# estado que dejó el anterior.
#
# Requiere: postgresql-16 instalado.
# -----------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS="$HERE/../migrations"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DATA="${PGDATA_TEST:-/var/lib/postgresql/coladb}"
PORT="${PGPORT_TEST:-5433}"
SOCK="${PGSOCK_TEST:-/tmp}"
export PGPORT_TEST="$PORT" PGSOCK_TEST="$SOCK"

psql_run() { psql -h "$SOCK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 "$@"; }

if ! psql_run -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "==> levantando Postgres en :$PORT"
  rm -rf "$DATA"; mkdir -p "$DATA"
  chown postgres:postgres "$DATA"; chmod 700 "$DATA"
  su postgres -c "$PGBIN/initdb -D $DATA -U postgres --auth=trust" >/dev/null
  su postgres -c "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k $SOCK' -l /tmp/pg.log start" >/dev/null
  sleep 2
fi

fresh_db() {
  psql_run -d postgres -q -c "drop database if exists cola;" >/dev/null
  psql_run -d postgres -q -c "create database cola;" >/dev/null
  psql_run -d cola -q -f "$HERE/00_supabase_shim.sql"
  for f in "$MIGRATIONS"/*.sql; do
    psql_run -d cola -q -f "$f"
  done
}

echo "==> migraciones: $(ls "$MIGRATIONS" | wc -l) archivos"

for suite in "$HERE"/0[124567]_*.sql; do
  echo
  echo "==> $(basename "$suite")"
  fresh_db
  psql_run -d cola -f "$suite"
done

echo
echo "==> 03_concurrency.sh"
fresh_db
"$HERE/03_concurrency.sh"

echo
echo "Todo verde."
