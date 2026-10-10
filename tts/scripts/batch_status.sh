#!/usr/bin/env bash
# Show progress for the active TTS batch (defaults to 1–212).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/work/days"
LOG="$ROOT/work/logs"

if [[ -n "${BATCH_PIDS:-}" ]]; then
  PIDS="$BATCH_PIDS"
elif [[ -L "$ROOT/work/batch.pids" || -f "$ROOT/work/batch.pids" ]]; then
  PIDS="$ROOT/work/batch.pids"
elif [[ -f "$ROOT/work/batch-1-212.pids" ]]; then
  PIDS="$ROOT/work/batch-1-212.pids"
else
  PIDS="$ROOT/work/batch-214-246.pids"
fi

# Infer range from pid filename (resolve symlink on macOS)
if [[ -L "$PIDS" ]]; then
  base="$(basename "$(readlink "$PIDS")")"
else
  base="$(basename "$PIDS")"
fi
if [[ "$base" == *1-212* ]]; then
  LABEL="1–212"
  KRV_START=2; KRV_END=212; KRV_TOTAL=211
  RNKSV_START=1; RNKSV_END=212; RNKSV_TOTAL=212
  LOG_KRV="$LOG/batch-1-212-krv.log"
  LOG_RNKSV="$LOG/batch-1-212-rnksv.log"
else
  LABEL="214–246"
  KRV_START=214; KRV_END=246; KRV_TOTAL=33
  RNKSV_START=214; RNKSV_END=246; RNKSV_TOTAL=33
  LOG_KRV="$LOG/batch-214-246-krv.log"
  LOG_RNKSV="$LOG/batch-214-246-rnksv.log"
fi

echo "=== batch $LABEL status ==="
if [[ -f "$PIDS" ]]; then
  while read -r line; do
    [[ -z "$line" ]] && continue
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

count_metas() {
  local tid=$1 start=$2 end=$3
  local n=0 d
  for d in $(seq "$start" "$end"); do
    if [[ -f "$WORK/$tid/female/day-$(printf '%03d' "$d")/meta.json" ]]; then
      n=$((n + 1))
    fi
  done
  echo "$n"
}

krv_n="$(count_metas krv "$KRV_START" "$KRV_END")"
rnksv_n="$(count_metas rnksv "$RNKSV_START" "$RNKSV_END")"
echo "krv: $krv_n/$KRV_TOTAL days in work/ (days ${KRV_START}-${KRV_END})"
echo "rnksv: $rnksv_n/$RNKSV_TOTAL days in work/ (days ${RNKSV_START}-${RNKSV_END})"

echo "--- latest log lines ---"
for f in "$LOG_KRV" "$LOG_RNKSV"; do
  if [[ -f "$f" ]]; then
    echo "## $(basename "$f")"
    tail -n 8 "$f" | sed 's/^/  /'
  fi
done
