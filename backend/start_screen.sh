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

SESSION_NAME="${1:-gpt-image-service}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8010}"
WORKERS="${WORKERS:-1}"

DEFAULT_PYTHON="$BASE_DIR/.venv/bin/python"
if [[ -x "$DEFAULT_PYTHON" ]]; then
  PYTHON_BIN="${PYTHON_BIN:-$DEFAULT_PYTHON}"
else
  PYTHON_BIN="${PYTHON_BIN:-python3}"
fi

mkdir -p "$BASE_DIR/logs"

if ! command -v screen >/dev/null 2>&1; then
  echo "screen is not installed"
  exit 1
fi

screen -wipe >/dev/null 2>&1 || true

if screen -list | grep -q "[.]${SESSION_NAME}[[:space:]]"; then
  echo "screen session ${SESSION_NAME} already exists"
  exit 1
fi

cd "$BASE_DIR"
screen -dmS "$SESSION_NAME" bash -lc "cd \"$BASE_DIR\" && \"$PYTHON_BIN\" -m uvicorn app:app --host \"$HOST\" --port \"$PORT\" --workers \"$WORKERS\" >> \"$BASE_DIR/logs/server.log\" 2>&1"

echo "started screen session: $SESSION_NAME"
echo "open site: http://127.0.0.1:${PORT}"
echo "workers: $WORKERS"
echo "log file: $BASE_DIR/logs/server.log"
