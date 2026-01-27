#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/apps/backend"
WEB_DIR="$ROOT_DIR/apps/web"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux nao encontrado. Instale o tmux e tente novamente."
  exit 1
fi

if ! tmux has-session -t backend 2>/dev/null; then
  tmux new-session -d -s backend -c "$BACKEND_DIR" "pnpm dev"
  echo "Sessao tmux 'backend' criada."
else
  echo "Sessao tmux 'backend' ja existe."
fi

if ! tmux has-session -t web 2>/dev/null; then
  tmux new-session -d -s web -c "$WEB_DIR" "pnpm dev"
  echo "Sessao tmux 'web' criada."
else
  echo "Sessao tmux 'web' ja existe."
fi

echo "Para entrar:"
echo "  tmux attach -t backend"
echo "  tmux attach -t web"
