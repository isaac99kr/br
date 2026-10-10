#!/usr/bin/env bash
# Keep the 1–212 dual batch running until complete; auto-resume on crash/abort.
# Status: bash tts/scripts/batch_status.sh
# Stop:   bash tts/scripts/batch_stop.sh  (then kill this watcher)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:${PATH:-}"

count_metas() {
  local tid=$1 start=$2 end=$3
  local n=0 d
  for d in $(seq "$start" "$end"); do
    if [[ -f "work/days/$tid/female/day-$(printf '%03d' "$d")/meta.json" ]]; then
      n=$((n + 1))
    fi
  done
  echo "$n"
}

is_complete() {
  local k r
  k="$(count_metas krv 2 212)"
  r="$(count_metas rnksv 1 212)"
  [[ "$k" -ge 211 && "$r" -ge 212 ]]
}

pids_running() {
  local pids=work/batch-1-212.pids
  [[ -f "$pids" ]] || return 1
  while read -r line; do
    [[ -z "$line" ]] && continue
    local pid="${line#*=}"
    kill -0 "$pid" 2>/dev/null && return 0
  done < "$pids"
  return 1
}

attempt=0
while ! is_complete; do
  attempt=$((attempt + 1))
  k="$(count_metas krv 2 212)"
  r="$(count_metas rnksv 1 212)"
  echo "$(date '+%Y-%m-%d %H:%M:%S') watch attempt=$attempt krv=$k/211 rnksv=$r/212"

  if pids_running; then
    echo "batch already running — polling every 10m"
    # Wait while generators live
    while pids_running && ! is_complete; do
      k="$(count_metas krv 2 212)"
      r="$(count_metas rnksv 1 212)"
      echo "$(date '+%Y-%m-%d %H:%M:%S') heartbeat krv=$k/211 rnksv=$r/212"
      sleep 600
    done
  else
    echo "starting/resuming batch_start_1_212.sh"
    set +e
    bash scripts/batch_start_1_212.sh
    ec=$?
    set -e
    echo "$(date '+%Y-%m-%d %H:%M:%S') batch_start exited ec=$ec"
  fi

  if is_complete; then
    break
  fi

  if grep -q 'Traceback\|ValueError' work/logs/batch-1-212-krv.log work/logs/batch-1-212-rnksv.log 2>/dev/null; then
    echo "error signatures in logs (will retry remaining days via skip-existing):"
    grep -E 'ValueError|Traceback|=== \[' work/logs/batch-1-212-krv.log | tail -8 || true
    grep -E 'ValueError|Traceback|=== \[' work/logs/batch-1-212-rnksv.log | tail -8 || true
  fi

  sleep 30
done

k="$(count_metas krv 2 212)"
r="$(count_metas rnksv 1 212)"
echo "$(date '+%Y-%m-%d %H:%M:%S') COMPLETE krv=$k/211 rnksv=$r/212"
bash scripts/batch_status.sh
