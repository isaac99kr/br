#!/usr/bin/env python3
"""Generate male CustomVoice candidates with locked A(v6) instruct."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from tts_text import sample_genesis_script  # noqa: E402

CONFIG = ROOT / "config" / "voice-selection.json"
OUT = ROOT / "work" / "samples"
REPORT = ROOT / "work" / "male-sample-report.json"


def pick_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda:0"
    return "cpu"


def main() -> None:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)

    device = pick_device()
    dtype = torch.float32 if device == "mps" or device == "cpu" else torch.bfloat16
    model_id = cfg["modelId"]
    language = cfg["language"]
    instruct = cfg.get("instruct") or cfg.get("male", {}).get("instruct")
    speakers = cfg["male"].get("candidates") or [cfg["male"]["speaker"]]

    text = sample_genesis_script()
    print(f"device={device} dtype={dtype} model={model_id}")
    print(f"text ({len(text)} chars): {text[:100]}...")

    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(
        model_id,
        device_map=device,
        dtype=dtype,
        attn_implementation="sdpa",
    )
    print(f"model loaded in {time.time() - t0:.1f}s")

    results = []
    for speaker in speakers:
        out_path = OUT / f"male_{speaker}_A_v6.wav"
        print(f"generating {out_path.name} ...")
        t1 = time.time()
        wavs, sr = model.generate_custom_voice(
            text=text,
            language=language,
            speaker=speaker,
            instruct=instruct,
        )
        audio = wavs[0]
        sf.write(str(out_path), audio, sr)
        duration = float(len(audio) / sr)
        elapsed = time.time() - t1
        row = {
            "file": str(out_path.relative_to(ROOT)),
            "speaker": speaker,
            "styleId": "A",
            "instruct": instruct,
            "chars": len(text),
            "durationSec": round(duration, 3),
            "sampleRate": int(sr),
            "wavBytes": out_path.stat().st_size,
            "charsPerSec": round(len(text) / duration, 3) if duration else 0,
            "genSec": round(elapsed, 2),
        }
        results.append(row)
        print(
            f"  {duration:.2f}s audio, {row['charsPerSec']:.2f} cps, "
            f"{row['wavBytes'] / 1024:.0f} KB, gen {elapsed:.1f}s"
        )

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "device": device,
        "modelId": model_id,
        "language": language,
        "instruct": instruct,
        "text": text,
        "results": results,
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {REPORT}")


if __name__ == "__main__":
    main()
