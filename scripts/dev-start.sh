#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.logs"
mkdir -p "$LOG_DIR"

start_service() {
  local name="$1"
  local cmd="$2"
  local log_file="$LOG_DIR/${name}.log"
  local pid_file="$LOG_DIR/${name}.pid"

  if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "$name already running (pid $(cat "$pid_file"))"
    return 0
  fi

  echo "Starting $name..."
  nohup bash -c "$cmd" > "$log_file" 2>&1 &
  echo $! > "$pid_file"
}

start_service "backend" "npm --workspace backend run dev"
start_service "web" "npm --workspace web run dev"
start_service "mobile" "npm --workspace mobile run dev"

echo "Logs in $LOG_DIR"
