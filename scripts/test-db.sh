#!/bin/bash
set -e
psql -U mac -d postgres -c "DROP DATABASE IF EXISTS proofpatch_test;" > /dev/null 2>&1 || true
psql -U mac -d postgres -c "CREATE DATABASE proofpatch_test;" > /dev/null
psql -U mac -d proofpatch_test -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" > /dev/null
# canonical schema (003) is self-contained; skip legacy 002
psql -U mac -d proofpatch_test -c "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW()); INSERT INTO _migrations(name) VALUES ('002_core_tables.sql');" > /dev/null
DATABASE_URL=postgresql://mac@localhost:5432/proofpatch_test node scripts/migrate.js 2>/dev/null | grep applied
