#!/usr/bin/env bash
# Start dual-process TTS batch for remaining days 1–212 (krv + rnksv).
# krv: 2–212 (day-001 already exists). rnksv: 1–212.
# Stop anytime:  bash tts/scripts/batch_stop.sh
# Status:       bash tts/scripts/batch_status.sh
# No git commit / Pages deploy — generate + local publish-each only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p work/logs
export SUPERTONIC_INTRA_OP_THREADS=4

PIDS_FILE=work/batch-1-212.pids

# Stop any previous 1–212 batch
if [[ -f "$PIDS_FILE" ]]; then
  BATCH_PIDS="$PIDS_FILE" bash scripts/batch_stop.sh || true
  sleep 1
fi

# Append logs on resume (skip-existing handles already-finished days)
{
  echo ""
  echo "===== resume $(date '+%Y-%m-%d %H:%M:%S') ====="
} >> work/logs/batch-1-212-krv.log
{
  echo ""
  echo "===== resume $(date '+%Y-%m-%d %H:%M:%S') ====="
} >> work/logs/batch-1-212-rnksv.log

# Prevent Mac idle sleep while this launcher (and children) run
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -dims -w $$ &
  CAFFEINE_PID=$!
  trap 'kill "$CAFFEINE_PID" 2>/dev/null || true' EXIT
fi

.venv/bin/python -u scripts/generate_day.py \
  --days 2-212 --translation krv --voices female --publish-each \
  >> work/logs/batch-1-212-krv.log 2>&1 &
KRV_PID=$!

.venv/bin/python -u scripts/generate_day.py \
  --days 1-212 --translation rnksv --voices female --publish-each \
  >> work/logs/batch-1-212-rnksv.log 2>&1 &
RNKSV_PID=$!

printf 'krv=%s\nrnksv=%s\n' "$KRV_PID" "$RNKSV_PID" > "$PIDS_FILE"
# Point default stop/status at this batch
ln -sfn batch-1-212.pids work/batch.pids

echo "Started batch 1–212 (generate only, no deploy)"
echo "  krv   pid=$KRV_PID  days=2-212  log=tts/work/logs/batch-1-212-krv.log"
echo "  rnksv pid=$RNKSV_PID  days=1-212  log=tts/work/logs/batch-1-212-rnksv.log"
echo "Status: bash tts/scripts/batch_status.sh"
echo "Stop:   bash tts/scripts/batch_stop.sh"
echo "ETA wall clock ~42–48h (dual parallel)"

# Heartbeat every 10 minutes while waiting
(
  while kill -0 "$KRV_PID" 2>/dev/null || kill -0 "$RNKSV_PID" 2>/dev/null; do
    krv_n=0
    rnksv_n=0
    for d in $(seq 2 212); do
      [[ -f "work/days/krv/female/day-$(printf '%03d' "$d")/meta.json" ]] && krv_n=$((krv_n + 1))
    done
    for d in $(seq 1 212); do
      [[ -f "work/days/rnksv/female/day-$(printf '%03d' "$d")/meta.json" ]] && rnksv_n=$((rnksv_n + 1))
    done
    echo "$(date '+%Y-%m-%d %H:%M:%S') heartbeat krv=$krv_n/211 rnksv=$rnksv_n/212"
    sleep 600
  done
) &
HB_PID=$!

set +e
wait "$KRV_PID"
KRV_EC=$?
wait "$RNKSV_PID"
RNKSV_EC=$?
set -e
kill "$HB_PID" 2>/dev/null || true

echo "Both processes finished. krv_ec=$KRV_EC rnksv_ec=$RNKSV_EC"
bash scripts/batch_status.sh
exit $(( KRV_EC != 0 || RNKSV_EC != 0 ? 1 : 0 ))
