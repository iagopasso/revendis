#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/revendis}"
export DB_URL

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install PostgreSQL client tools first." >&2
  exit 1
fi

DB_HOST=$(python3 - <<'PY'
import os
from urllib.parse import urlparse

url = os.environ.get("DB_URL", "")
print(urlparse(url).hostname or "")
PY
)
IS_LOCAL_HOST=0
if [ -z "$DB_HOST" ] || [ "$DB_HOST" = "localhost" ] || [ "$DB_HOST" = "127.0.0.1" ]; then
  IS_LOCAL_HOST=1
fi

if ! psql "$DB_URL" -c "SELECT 1" >/dev/null 2>&1; then
  if [ "$IS_LOCAL_HOST" -ne 1 ]; then
    echo "Database not reachable with provided DATABASE_URL." >&2
    echo "For SaaS databases, create the database in your provider and verify credentials/SSL first." >&2
    exit 1
  fi

  echo "Database not reachable. Attempting to create it..." >&2
  DB_NAME=$(python3 - <<'PY'
import os
from urllib.parse import urlparse

url = os.environ.get("DB_URL")
parsed = urlparse(url)
db = (parsed.path or "").lstrip("/") or "revendis"
print(db)
PY
)
  ADMIN_URL=$(python3 - <<'PY'
import os
from urllib.parse import urlparse, urlunparse

url = os.environ.get("DB_URL")
parsed = urlparse(url)
new_path = "/postgres"
print(urlunparse(parsed._replace(path=new_path)))
PY
)
  psql "$ADMIN_URL" -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
    psql "$ADMIN_URL" -c "CREATE DATABASE \"${DB_NAME}\";"
fi

for file in "$ROOT_DIR"/db/migrations/*.sql; do
  echo "Applying $file"
  psql "$DB_URL" -f "$file"
done
