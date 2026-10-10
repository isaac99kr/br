#!/usr/bin/env bash
# Stop the active dual-translation TTS batch (graceful SIGTERM, then SIGKILL).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -n "${BATCH_PIDS:-}" ]]; then
  PIDS="$BATCH_PIDS"
elif [[ -L "$ROOT/work/batch.pids" || -f "$ROOT/work/batch.pids" ]]; then
  PIDS="$ROOT/work/batch.pids"
elif [[ -f "$ROOT/work/batch-1-212.pids" ]]; then
  PIDS="$ROOT/work/batch-1-212.pids"
else
  PIDS="$ROOT/work/batch-214-246.pids"
fi

if [[ ! -f "$PIDS" ]]; then
  echo "No pid file at $PIDS — nothing to stop."
  exit 0
fi

echo "Stopping batch from $PIDS …"
while read -r line; do
  [[ -z "$line" ]] && continue
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
  [[ -z "$line" ]] && continue
  name="${line%%=*}"; pid="${line#*=}"
  if kill -0 "$pid" 2>/dev/null; then
    echo "Force-killing $name (pid $pid)…"
    kill -KILL "$pid" 2>/dev/null || true
  fi
done < "$PIDS"

echo "Batch stop signal sent. Check: bash tts/scripts/batch_status.sh"
