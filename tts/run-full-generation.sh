#!/usr/bin/env bash
set -euo pipefail

# 저장소 루트에서 실행하는 성경 전체 MP3 생성 운영 명령.
# 합성 결과는 tts/work에 누적되며, 중단 후 같은 명령으로 이어진다.
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
PYTHON="tts/.venv/bin/python"
SUPERVISOR="tts/scripts/run_full_bible.py"

case "${1:-}" in
  start)
    exec "$PYTHON" "$SUPERVISOR" --start
    ;;
  stop)
    exec "$PYTHON" "$SUPERVISOR" --stop
    ;;
  status)
    exec "$PYTHON" "$SUPERVISOR" --status
    ;;
  log)
    exec tail -f tts/work/batches/full-bible.log
    ;;
  batch)
    shift
    exec "$PYTHON" tts/scripts/generate_chapters.py "$@"
    ;;
  *)
    cat >&2 <<'USAGE'
사용법:
  tts/run-full-generation.sh start   # krv → rnksv 전체 생성 시작/재개
  tts/run-full-generation.sh status  # 두 번역 진행률 확인
  tts/run-full-generation.sh log     # 전체 생성 로그 보기
  tts/run-full-generation.sh stop    # 현재 장 검증 후 중단
  tts/run-full-generation.sh batch --translation krv --max-chapters 1
USAGE
    exit 2
    ;;
esac
