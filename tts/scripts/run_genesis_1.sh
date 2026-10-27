#!/usr/bin/env bash
set -euo pipefail
TTS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$TTS_ROOT/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  echo '가상환경이 없습니다. tts/README-mac-mini.md의 최초 설치를 진행하세요.' >&2
  exit 1
fi
for tool in ffmpeg ffprobe; do
  command -v "$tool" >/dev/null || { echo "$tool 설치 필요: brew install ffmpeg" >&2; exit 1; }
done
"$PYTHON" -c 'import supertonic, numpy, soundfile, huggingface_hub'
exec "$PYTHON" "$TTS_ROOT/scripts/generate_chapter.py" --translation krv --book 창 --chapter 1 ${TTS_THREADS:+--threads "$TTS_THREADS"} "$@"
