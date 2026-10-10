#!/usr/bin/env bash
# Start dual-process TTS batch for days 214–246 (krv + rnksv).
# Stop anytime:  bash tts/scripts/batch_stop.sh
# Status:       bash tts/scripts/batch_status.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p work/logs
export SUPERTONIC_INTRA_OP_THREADS=4

# Stop any previous batch PIDs from pid file
if [[ -f work/batch-214-246.pids ]]; then
  bash scripts/batch_stop.sh || true
  sleep 1
fi

: > work/logs/batch-214-246-krv.log
: > work/logs/batch-214-246-rnksv.log

.venv/bin/python -u scripts/generate_day.py \
  --days 214-246 --translation krv --voices female --publish-each \
  >> work/logs/batch-214-246-krv.log 2>&1 &
KRV_PID=$!

.venv/bin/python -u scripts/generate_day.py \
  --days 214-246 --translation rnksv --voices female --publish-each \
  >> work/logs/batch-214-246-rnksv.log 2>&1 &
RNKSV_PID=$!

printf 'krv=%s\nrnksv=%s\n' "$KRV_PID" "$RNKSV_PID" > work/batch-214-246.pids
echo "Started batch 214–246"
echo "  krv   pid=$KRV_PID  log=tts/work/logs/batch-214-246-krv.log"
echo "  rnksv pid=$RNKSV_PID  log=tts/work/logs/batch-214-246-rnksv.log"
echo "Status: bash tts/scripts/batch_status.sh"
echo "Stop:   bash tts/scripts/batch_stop.sh"

# Keep this launcher alive while children run (so the Cursor terminal session stays up)
wait "$KRV_PID" "$RNKSV_PID"
echo "Both processes finished."
bash scripts/batch_status.sh
