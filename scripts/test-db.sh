#!/bin/bash
# Resets the test database and applies migrations.
# Honors PGUSER/PGHOST/PGPORT/DATABASE_URL so it runs locally AND in CI.
set -e
PGUSER="${PGUSER:-$(whoami)}"
DB="${TEST_DB_NAME:-proofpatch_test}"
export PGDATABASE="$DB"
psql_args=(-v ON_ERROR_STOP=1)
dropdb --if-exists ${psql_args[@]} > /dev/null 2>&1 || \
  psql -d postgres -c "DROP DATABASE IF EXISTS \"$DB\";" > /dev/null 2>&1 || true
createdb ${psql_args[@]} 2>/dev/null || psql -d postgres -c "CREATE DATABASE \"$DB\";" > /dev/null
psql ${psql_args[@]} -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' > /dev/null
# canonical schema (003) is self-contained; skip legacy 002
psql ${psql_args[@]} -c "CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY); INSERT INTO _migrations(name) VALUES ('002_core_tables.sql');" > /dev/null
DATABASE_URL="${TEST_DATABASE_URL:-postgresql://$PGUSER@${PGHOST:-localhost}:${PGPORT:-5432}/$DB}" node scripts/migrate.js 2>/dev/null | grep applied
