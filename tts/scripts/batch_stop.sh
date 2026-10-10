#!/usr/bin/env bash
# Stop the 214-246 dual-translation batch (graceful SIGTERM, then SIGKILL).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDS="$ROOT/work/batch-214-246.pids"

if [[ ! -f "$PIDS" ]]; then
  echo "No pid file at $PIDS — nothing to stop."
  exit 0
fi

while read -r line; do
  name="${line%%=*}"; pid="${line#*=}"
  if kill -0 "$pid" 2>/dev/null; then
    echo "Stopping $name (pid $pid)…"
    kill -TERM "$pid" 2>/dev/null || true
  else
    echo "$name (pid $pid) already stopped"
  fi
done < "$PIDS"

sleep 2
while read -r line; do
  name="${line%%=*}"; pid="${line#*=}"
  if kill -0 "$pid" 2>/dev/null; then
    echo "Force-killing $name (pid $pid)…"
    kill -KILL "$pid" 2>/dev/null || true
  fi
done < "$PIDS"

echo "Batch stop signal sent. Check: bash tts/scripts/batch_status.sh"
