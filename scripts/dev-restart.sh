#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Reiniciando ambiente de desenvolvimento..."
"$ROOT_DIR/scripts/dev-stop.sh"
sleep 1
"$ROOT_DIR/scripts/dev-start.sh"

echo "Reinicio concluido."
