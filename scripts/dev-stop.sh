#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.logs"

stop_service() {
  local name="$1"
  local pid_file="$LOG_DIR/${name}.pid"
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $name (pid $pid)"
      kill "$pid"
    fi
    rm -f "$pid_file"
  fi
}

stop_service "mobile"
stop_service "web"
stop_service "backend"
