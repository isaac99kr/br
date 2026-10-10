#!/usr/bin/env bash
# Show progress for the 214-246 dual-translation batch.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/work/days"
LOG="$ROOT/work/logs"
PIDS="$ROOT/work/batch-214-246.pids"

echo "=== batch 214–246 status ==="
if [[ -f "$PIDS" ]]; then
  while read -r line; do
    name="${line%%=*}"; pid="${line#*=}"
    if kill -0 "$pid" 2>/dev/null; then
      echo "$name pid=$pid RUNNING"
    else
      echo "$name pid=$pid stopped"
    fi
  done < "$PIDS"
else
  echo "(no pid file — batch not started or cleaned up)"
fi

for tid in krv rnksv; do
  n=0
  for d in $(seq 214 246); do
    if [[ -f "$WORK/$tid/female/day-$(printf '%03d' "$d")/meta.json" ]]; then
      n=$((n + 1))
    fi
  done
  echo "$tid: $n/33 days in work/"
done

echo "--- latest log lines ---"
for f in "$LOG"/batch-214-246-krv.log "$LOG"/batch-214-246-rnksv.log; do
  if [[ -f "$f" ]]; then
    echo "## $(basename "$f")"
    tail -n 8 "$f" | sed 's/^/  /'
  fi
done
