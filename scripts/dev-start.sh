#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.logs"
mkdir -p "$LOG_DIR"

port_listener_pid() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

start_service() {
  local name="$1"
  local cmd="$2"
  local port="$3"
  local log_file="$LOG_DIR/${name}.log"
  local pid_file="$LOG_DIR/${name}.pid"

  if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "$name already running (pid $(cat "$pid_file"))"
    return 0
  fi

  local listener_pid
  listener_pid="$(port_listener_pid "$port")"
  if [ -n "$listener_pid" ]; then
    echo "$name not started: port $port already in use by pid $listener_pid"
    echo "Run scripts/dev-stop.sh to clean stale processes."
    return 1
  fi

  echo "Starting $name..."
  nohup bash -c "$cmd" > "$log_file" 2>&1 &
  echo $! > "$pid_file"

  sleep 1
  if ! kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "Failed to start $name. Last log lines:"
    tail -n 40 "$log_file" || true
    return 1
  fi
}

start_service "backend" "npm --workspace backend run dev" "3001"
start_service "web" "npm --workspace web run dev" "3000"
start_service "mobile" "npm --workspace mobile run dev" "8081"

echo "Logs in $LOG_DIR"
