#!/usr/bin/env python3
"""Phase 1: generate Sohee × style A/B/C samples (local only)."""

from __future__ import annotations

import json
import time
from pathlib import Path

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config"
OUT = ROOT / "work" / "samples"
REPORT = ROOT / "work" / "sample-report.json"


def pick_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda:0"
    return "cpu"


def main() -> None:
    styles_cfg = json.loads((CONFIG / "voice-styles.json").read_text(encoding="utf-8"))
    texts_cfg = json.loads((CONFIG / "sample-texts.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)

    device = pick_device()
    # MPS float16 often hits NaN in sampling; use float32 on Apple Silicon.
    if device == "mps":
        dtype = torch.float32
    elif device.startswith("cuda"):
        dtype = torch.bfloat16
    else:
        dtype = torch.float32
    model_id = styles_cfg["modelId"]
    speaker = styles_cfg["speaker"]
    language = styles_cfg["language"]

    print(f"device={device} dtype={dtype} model={model_id}")
    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(
        model_id,
        device_map=device,
        dtype=dtype,
        attn_implementation="sdpa",
    )
    print(f"model loaded in {time.time() - t0:.1f}s")

    # Use the first short passage for A/B/C comparison (same text)
    passage = texts_cfg["passages"][0]
    results = []

    for style in styles_cfg["styles"]:
        out_path = OUT / f"{passage['id']}_Sohee_{style['id']}_v6.wav"
        print(f"generating {out_path.name} ...")
        t1 = time.time()
        wavs, sr = model.generate_custom_voice(
            text=passage["text"],
            language=language,
            speaker=speaker,
            instruct=style["instruct"],
        )
        audio = wavs[0]
        sf.write(str(out_path), audio, sr)
        duration = float(len(audio) / sr)
        elapsed = time.time() - t1
        chars = len(passage["text"])
        cps = chars / duration if duration else 0
        bytes_ = out_path.stat().st_size
        row = {
            "file": str(out_path.relative_to(ROOT)),
            "styleId": style["id"],
            "styleLabel": style["label"],
            "speaker": speaker,
            "passageId": passage["id"],
            "chars": chars,
            "durationSec": round(duration, 3),
            "sampleRate": int(sr),
            "wavBytes": bytes_,
            "charsPerSec": round(cps, 3),
            "genSec": round(elapsed, 2),
        }
        results.append(row)
        print(
            f"  {duration:.2f}s audio, {cps:.2f} cps, "
            f"{bytes_ / 1024:.0f} KB wav, gen {elapsed:.1f}s"
        )

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "device": device,
        "modelId": model_id,
        "speaker": speaker,
        "language": language,
        "passage": passage,
        "results": results,
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {REPORT}")


if __name__ == "__main__":
    main()
