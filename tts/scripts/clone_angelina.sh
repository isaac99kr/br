#!/usr/bin/env sh
# Clone Call-center Angelina prompt → tts/voices/angelina.json (Supertonic 3 style).
# Requires: cargo install supertonic3-tts (binary may install as `main`; symlink to supertonic3-tts)
#           speaker_encoder.onnx in ~/.cache/supertonic3 (see download-model.sh in the crate)
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="${SUPERTONIC3_MODEL:-$HOME/.cache/supertonic3}"
REF="$ROOT/voices/refs/angelina_prompt_mono.wav"
TEXT_FILE="$ROOT/voices/refs/angelina_prompt_ko.txt"
OUT="$ROOT/voices/angelina.json"
CLI="${SUPERTONIC3_CLI:-supertonic3-tts}"

if [ ! -f "$REF" ]; then
  echo "missing $REF — convert stereo prompt to mono 44.1k first" >&2
  exit 1
fi
REF_TEXT="$(cat "$TEXT_FILE")"
mkdir -p "$ROOT/work/samples"

"$CLI" clone \
  --root-models-path "$MODEL" \
  --reference "$REF" \
  --ref-text "$REF_TEXT" \
  --language ko \
  --init-voice F3 \
  --probe "안녕하세요, 오늘도 평안하시길 바랍니다." \
  --probe "태초에 하나님이 천지를 창조하시니라." \
  --probe "여호와는 나의 목자시니 내게 부족함이 없으리로다." \
  --output "$OUT" \
  --save-every 10 \
  --voice-quality 5 \
  --mix-iters 30 \
  --row-iters 40 \
  --iters 60 \
  --sample-text "창세기 1장. 태초에 하나님이 천지를 창조하시니라." \
  --sample-output "$ROOT/work/samples/angelina_clone_sample.wav" \
  --verbose
