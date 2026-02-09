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

stop_port_listener() {
  local port="$1"
  local label="$2"
  local pids
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $label listener on port $port (pid $pid)"
      kill "$pid" 2>/dev/null || true
    fi
  done
}

stop_tmux_session() {
  local name="$1"
  if ! command -v tmux >/dev/null 2>&1; then
    return 0
  fi
  if tmux has-session -t "$name" 2>/dev/null; then
    echo "Stopping tmux session '$name'"
    tmux kill-session -t "$name" || true
  fi
}

stop_service "mobile"
stop_service "web"
stop_service "backend"
stop_port_listener "3000" "web"
stop_port_listener "3001" "backend"
stop_port_listener "8081" "mobile"
stop_tmux_session "mobile"
stop_tmux_session "web"
stop_tmux_session "backend"
