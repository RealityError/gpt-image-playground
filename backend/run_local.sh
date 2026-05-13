#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

PROJECT_ROOT="$(cd "$BASE_DIR/.." && pwd)"

if [[ -f "$PROJECT_ROOT/.env" ]]; then
  set -a
  . "$PROJECT_ROOT/.env"
  set +a
elif [[ -f "$BASE_DIR/.env" ]]; then
  set -a
  . "$BASE_DIR/.env"
  set +a
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8010}"

DEFAULT_PYTHON="$BASE_DIR/.venv/bin/python"
if [[ -x "$DEFAULT_PYTHON" ]]; then
  PYTHON_BIN="${PYTHON_BIN:-$DEFAULT_PYTHON}"
else
  PYTHON_BIN="${PYTHON_BIN:-python3}"
fi

cd "$BASE_DIR"
exec "$PYTHON_BIN" -m uvicorn app:app --host "$HOST" --port "$PORT"
