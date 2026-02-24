#!/bin/sh
set -eu

service_name="$(printf '%s' "${RAILWAY_SERVICE_NAME:-}" | tr '[:upper:]' '[:lower:]')"
app_role="$(printf '%s' "${APP_ROLE:-}" | tr '[:upper:]' '[:lower:]')"

if [ "$service_name" = "backend" ] || [ "$app_role" = "backend" ]; then
  export PORT="${PORT:-3001}"
  exec pnpm --filter backend start
fi

if [ "$service_name" = "web" ] || [ "$app_role" = "web" ]; then
  export PORT="${PORT:-3000}"
  exec pnpm --filter web start
fi

echo "Unable to resolve service role. Configure RAILWAY_SERVICE_NAME or APP_ROLE as backend|web." >&2
exit 1
