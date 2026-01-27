#!/usr/bin/env bash
set -euo pipefail

DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-revendis}"

export PGPASSWORD="${DB_PASSWORD}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql nao encontrado. Instale o PostgreSQL client e tente novamente."
  exit 1
fi

if ! command -v createdb >/dev/null 2>&1; then
  echo "createdb nao encontrado. Instale o PostgreSQL client e tente novamente."
  exit 1
fi

if ! pg_isready -h "${DB_HOST}" -p "${DB_PORT}" >/dev/null 2>&1; then
  echo "Postgres nao esta respondendo em ${DB_HOST}:${DB_PORT}."
  exit 1
fi

if ! psql "postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" -c "select 1" >/dev/null 2>&1; then
  echo "Criando banco ${DB_NAME}..."
  createdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "${DB_NAME}"
else
  echo "Banco ${DB_NAME} ja existe."
fi

echo "Aplicando migrations..."
bash "$(dirname "$0")/db-apply.sh"
