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

start_service_tmux() {
  local name="$1"
  local session_name="$2"
  local cwd="$3"
  local cmd="$4"
  local port="$5"
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

  if ! command -v tmux >/dev/null 2>&1; then
    start_service "$name" "$cmd" "$port"
    return 0
  fi

  echo "Starting $name in tmux session '$session_name'..."
  : > "$log_file"
  tmux new-session -d -s "$session_name" -c "$cwd" "$cmd"
  tmux pipe-pane -o -t "$session_name":0.0 "cat >> \"$log_file\""

  local pane_pid
  pane_pid="$(tmux list-panes -t "$session_name" -F '#{pane_pid}' | head -n 1 || true)"
  if [ -n "$pane_pid" ]; then
    echo "$pane_pid" > "$pid_file"
  fi

  sleep 2
  listener_pid="$(port_listener_pid "$port")"
  if [ -z "$listener_pid" ]; then
    echo "Failed to start $name in tmux. Last log lines:"
    tail -n 40 "$log_file" || true
    return 1
  fi
}

start_service_tmux "backend" "backend" "$ROOT_DIR/apps/backend" "npm run dev" "3001"
start_service_tmux "web" "web" "$ROOT_DIR/apps/web" "npm run dev" "3000"
start_service_tmux "mobile" "mobile" "$ROOT_DIR/apps/mobile" "npm run dev" "8082"

echo "Logs in $LOG_DIR"

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [ -n "$LAN_IP" ]; then
  echo "Web LAN URL: http://$LAN_IP:3000"
  echo "API LAN URL: http://$LAN_IP:3001/api/health"
fi
