#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.logs"
BACKEND_ENV_FILE="$ROOT_DIR/apps/backend/.env.local"
mkdir -p "$LOG_DIR"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Comando obrigatorio nao encontrado: $cmd"
    exit 1
  fi
}

require_cmd cloudflared
require_cmd tmux

read_env_value() {
  local file="$1"
  local key="$2"
  if [ ! -f "$file" ]; then
    return 0
  fi
  awk -F'=' -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$file"
}

upsert_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"

  local tmp_file
  tmp_file="$(mktemp)"

  if [ -f "$file" ]; then
    awk -v key="$key" -v value="$value" '
      BEGIN { found = 0 }
      $0 ~ ("^" key "=") {
        print key "=" value
        found = 1
        next
      }
      { print }
      END {
        if (!found) print key "=" value
      }
    ' "$file" > "$tmp_file"
  else
    printf '%s=%s\n' "$key" "$value" > "$tmp_file"
  fi

  mv "$tmp_file" "$file"
}

port_listener_pid() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

wait_for_port_listener() {
  local port="$1"
  local timeout="$2"
  local elapsed=0
  while [ "$elapsed" -lt "$timeout" ]; do
    if [ -n "$(port_listener_pid "$port")" ]; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

kill_tmux_session_if_exists() {
  local session="$1"
  if tmux has-session -t "$session" 2>/dev/null; then
    tmux kill-session -t "$session" || true
  fi
}

start_tunnel() {
  local session="$1"
  local target_url="$2"
  local log_file="$3"
  local pid_file="$4"

  kill_tmux_session_if_exists "$session"
  : > "$log_file"

  tmux new-session -d -s "$session" -c "$ROOT_DIR" "cloudflared tunnel --no-autoupdate --url $target_url 2>&1"
  tmux pipe-pane -o -t "$session":0.0 "cat >> \"$log_file\""

  local pane_pid
  pane_pid="$(tmux list-panes -t "$session" -F '#{pane_pid}' | head -n 1 || true)"
  if [ -n "$pane_pid" ]; then
    echo "$pane_pid" > "$pid_file"
  fi
}

extract_tunnel_url() {
  local log_file="$1"
  grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$log_file" | tail -n 1 || true
}

wait_for_tunnel_url() {
  local log_file="$1"
  local timeout="$2"
  local elapsed=0
  while [ "$elapsed" -lt "$timeout" ]; do
    local url
    url="$(extract_tunnel_url "$log_file")"
    if [ -n "$url" ]; then
      echo "$url"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

MP_ACCESS_TOKEN="${1:-${MERCADO_PAGO_ACCESS_TOKEN:-}}"
if [ -z "$MP_ACCESS_TOKEN" ]; then
  MP_ACCESS_TOKEN="$(read_env_value "$BACKEND_ENV_FILE" "MERCADO_PAGO_ACCESS_TOKEN")"
fi

if [ -z "$MP_ACCESS_TOKEN" ]; then
  echo "Informe o access token do Mercado Pago no comando:"
  echo "  scripts/dev-setup-mercadopago-local.sh APP_USR-..."
  exit 1
fi

if ! wait_for_port_listener 3000 2 || ! wait_for_port_listener 3001 2; then
  echo "Iniciando ambiente de desenvolvimento (web/backend/mobile)..."
  "$ROOT_DIR/scripts/dev-start.sh"
fi

WEB_TUNNEL_LOG="$LOG_DIR/tunnel-web.log"
WEB_TUNNEL_PID="$LOG_DIR/tunnel-web.pid"
API_TUNNEL_LOG="$LOG_DIR/tunnel-backend.log"
API_TUNNEL_PID="$LOG_DIR/tunnel-backend.pid"

echo "Subindo tunel publico para WEB (porta 3000)..."
start_tunnel "tunnel-web" "http://127.0.0.1:3000" "$WEB_TUNNEL_LOG" "$WEB_TUNNEL_PID"
WEB_PUBLIC_URL="$(wait_for_tunnel_url "$WEB_TUNNEL_LOG" 45 || true)"
if [ -z "$WEB_PUBLIC_URL" ]; then
  echo "Falha ao obter URL publica da web. Verifique: $WEB_TUNNEL_LOG"
  exit 1
fi

echo "Subindo tunel publico para API (porta 3001)..."
start_tunnel "tunnel-backend" "http://127.0.0.1:3001" "$API_TUNNEL_LOG" "$API_TUNNEL_PID"
API_PUBLIC_URL="$(wait_for_tunnel_url "$API_TUNNEL_LOG" 45 || true)"
if [ -z "$API_PUBLIC_URL" ]; then
  echo "Falha ao obter URL publica da API. Verifique: $API_TUNNEL_LOG"
  exit 1
fi

WEBHOOK_URL="${API_PUBLIC_URL}/api/storefront/payments/mercado-pago/webhook"

upsert_env_value "$BACKEND_ENV_FILE" "MERCADO_PAGO_ACCESS_TOKEN" "$MP_ACCESS_TOKEN"
upsert_env_value "$BACKEND_ENV_FILE" "MERCADO_PAGO_PUBLIC_BASE_URL" "$WEB_PUBLIC_URL"
upsert_env_value "$BACKEND_ENV_FILE" "MERCADO_PAGO_WEBHOOK_URL" "$WEBHOOK_URL"

echo "Reiniciando backend para carregar variaveis..."
kill_tmux_session_if_exists "backend"
rm -f "$LOG_DIR/backend.pid"
"$ROOT_DIR/scripts/dev-start.sh"

cat <<EOF

Configuracao concluida.

WEB_PUBLIC_URL=$WEB_PUBLIC_URL
API_PUBLIC_URL=$API_PUBLIC_URL
MERCADO_PAGO_PUBLIC_BASE_URL=$WEB_PUBLIC_URL
MERCADO_PAGO_WEBHOOK_URL=$WEBHOOK_URL

Arquivo atualizado: $BACKEND_ENV_FILE

Observacao: os links .trycloudflare.com mudam quando o tunel reinicia.
Para renovar tudo, rode novamente este script.
EOF
