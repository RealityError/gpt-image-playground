#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="${1:-gpt-image-service}"

if ! command -v screen >/dev/null 2>&1; then
  echo "screen is not installed"
  exit 1
fi

screen -S "$SESSION_NAME" -X quit
echo "stopped screen session: $SESSION_NAME"
